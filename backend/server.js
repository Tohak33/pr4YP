const crypto = require('crypto');
const dns = require('node:dns').promises;
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432
});
const app = express();
app.use(cors());
app.use(express.json());
const MAX_QUANTITY = 10;
const legacyCategories = ['Смартфоны', 'Наушники'];
const tokenHash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (res, status, error) => res.status(status).json({ error });
const safe = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function checkPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate =
    hash.length === 128
      ? crypto.scryptSync(password, salt, 64).toString('hex')
      : crypto
          .createHash('sha256')
          .update(salt + password)
          .digest('hex');
  return (
    hash.length === candidate.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate))
  );
}
const validName = (name) => {
  if (typeof name !== 'string') return false;
  const value = name.trim();
  if (
    !/^(?:[А-ЯЁ][а-яё]{1,30}|[A-Z][a-z]{1,30})(?:[ -](?:[А-ЯЁ][а-яё]{1,30}|[A-Z][a-z]{1,30})){1,2}$/.test(
      value
    )
  )
    return false;
  if (/([А-ЯЁA-Z])\1\1|йцу|фыв|ячс|qwe|asd|zxc/iu.test(value)) return false;
  return value
    .split(/[ -]/)
    .every((part) =>
      /[А-ЯЁ]/iu.test(part)
        ? !/^[ЫЪЬ]/iu.test(part) &&
          /[АЕЁИОУЫЭЮЯ]/iu.test(part) &&
          /[БВГДЖЗЙКЛМНПРСТФХЦЧШЩ]/iu.test(part)
        : /[AEIOUY]/iu.test(part) && /[BCDFGHJKLMNPQRSTVWXZ]/iu.test(part)
    );
};
const validEmail = (email) =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const validPhone = (phone) =>
  typeof phone === 'string' && /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(phone);
const publicUser = (row) => ({
  name: row.name,
  email: row.email,
  phone: row.phone || '',
  ...(row.role === 'admin' ? {} : { address: row.address || '' }),
  role: row.role
});

async function issueSession(client, row) {
  const token = crypto.randomBytes(32).toString('hex');
  await client.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [tokenHash(token), row.id]
  );
  return { token, user: publicUser(row) };
}
const authenticate = safe(async (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return fail(res, 401, 'Требуется вход в аккаунт');
  const result = await pool.query(
    `SELECT u.id,u.name,u.email,u.phone,u.address,r.name AS role
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id
    WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [tokenHash(token)]
  );
  if (!result.rowCount) return fail(res, 401, 'Сессия истекла. Войдите снова');
  req.user = result.rows[0];
  req.token = token;
  next();
});
const admin = (req, res, next) =>
  req.user.role === 'admin' ? next() : fail(res, 403, 'Доступ запрещён');
const customer = (req, res, next) =>
  req.user.role === 'customer' ? next() : fail(res, 403, 'Доступ запрещён');

app.get(
  '/api/health',
  safe(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  })
);
app.post(
  '/api/auth/register',
  safe(async (req, res) => {
    const { name, email, password, phone } = req.body;
    if (!validName(name))
      return fail(res, 400, 'Укажите настоящее ФИО: минимум имя и фамилию с заглавной буквы');
    if (
      !validEmail(email) ||
      !validPhone(phone) ||
      typeof password !== 'string' ||
      password.length < 8
    )
      return fail(res, 400, 'Проверьте email, телефон +7 (999) 999-99-99 и пароль от 8 символов');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO users(role_id,name,email,password_hash,address,phone)
      SELECT r.id,$1,$2,$3,'',$4 FROM roles r WHERE r.name='customer' RETURNING *`,
        [name.trim(), email.trim().toLowerCase(), hashPassword(password), phone]
      );
      if (!result.rowCount) throw new Error('Роль покупателя не найдена');
      const payload = await issueSession(client, { ...result.rows[0], role: 'customer' });
      await client.query('COMMIT');
      res.status(201).json(payload);
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return fail(res, 409, 'Этот email уже зарегистрирован');
      throw e;
    } finally {
      client.release();
    }
  })
);
app.post(
  '/api/auth/login',
  safe(async (req, res) => {
    const { email, password } = req.body;
    if (!validEmail(email) || !password) return fail(res, 400, 'Введите email и пароль');
    const result = await pool.query(
      `SELECT u.*,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE lower(u.email)=lower($1)`,
      [email]
    );
    if (!result.rowCount || !checkPassword(password, result.rows[0].password_hash))
      return fail(res, 401, 'Неверный email или пароль');
    res.json(await issueSession(pool, result.rows[0]));
  })
);
app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
app.post(
  '/api/auth/logout',
  authenticate,
  safe(async (req, res) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(req.token)]);
    res.json({ ok: true });
  })
);
app.put(
  '/api/auth/profile',
  authenticate,
  safe(async (req, res) => {
    const { name, email, phone, address, password } = req.body;
    if (
      !validName(name) ||
      !validEmail(email) ||
      !validPhone(phone) ||
      (req.user.role !== 'admin' && (typeof address !== 'string' || address.length > 500)) ||
      (password && password.length < 8)
    )
      return fail(res, 400, 'Проверьте ФИО, email, телефон, адрес и пароль');
    try {
      const result = await pool.query(
        `UPDATE users SET name=$1,email=$2,phone=$3,address=$4,
      password_hash=COALESCE($5,password_hash) WHERE id=$6 RETURNING *`,
        [
          name.trim(),
          email.trim().toLowerCase(),
          phone,
          req.user.role === 'admin' ? req.user.address : address.trim(),
          password ? hashPassword(password) : null,
          req.user.id
        ]
      );
      res.json({ user: publicUser({ ...result.rows[0], role: req.user.role }) });
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'Email уже занят');
      throw e;
    }
  })
);

app.post(
  '/api/auth/forgot',
  safe(async (req, res) => {
    const { email } = req.body;
    if (!validEmail(email)) return fail(res, 400, 'Введите корректный email');
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD)
      return fail(res, 503, 'Отправка писем пока не настроена');
    const result = await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
    if (result.rowCount) {
      const code = crypto.randomInt(100000, 1000000).toString();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO password_resets(user_id,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')
        ON CONFLICT(user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at`,
          [result.rows[0].id, tokenHash(code)]
        );
        const smtpHost = process.env.SMTP_HOST;
        const { address } = await dns.lookup(smtpHost, { family: 4 });
        const transport = nodemailer.createTransport({
          host: address,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === 'true',
          tls: { servername: smtpHost },
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        });
        await transport.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Мебельный магазин — восстановление пароля',
          text: `Код для сброса пароля: ${code}. Он действует 10 минут.`
        });
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    res.json({ message: 'Если адрес зарегистрирован, письмо с кодом отправлено' });
  })
);
app.post(
  '/api/auth/reset',
  safe(async (req, res) => {
    const { email, code, password } = req.body;
    if (
      !validEmail(email) ||
      !/^\d{6}$/.test(code || '') ||
      typeof password !== 'string' ||
      password.length < 8
    )
      return fail(res, 400, 'Проверьте email, шестизначный код и новый пароль от 8 символов');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT p.user_id,p.code_hash FROM password_resets p JOIN users u ON u.id=p.user_id
      WHERE lower(u.email)=lower($1) AND p.expires_at>now() FOR UPDATE OF p`,
        [email]
      );
      if (!result.rowCount || result.rows[0].code_hash !== tokenHash(code)) {
        await client.query('ROLLBACK');
        return fail(res, 400, 'Неверный или просроченный код');
      }
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
        hashPassword(password),
        result.rows[0].user_id
      ]);
      await client.query('DELETE FROM password_resets WHERE user_id=$1', [result.rows[0].user_id]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [result.rows[0].user_id]);
      await client.query('COMMIT');
      res.json({ message: 'Пароль изменён. Теперь войдите в аккаунт' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

app.get(
  '/api/categories',
  safe(async (_req, res) => {
    const result = await pool.query(
      `SELECT c.name FROM categories c WHERE c.name NOT IN ('Смартфоны','Наушники') ORDER BY c.name`
    );
    res.json(result.rows);
  })
);
app.post(
  '/api/admin/categories',
  authenticate,
  admin,
  safe(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 60)
      return fail(res, 400, 'Название категории: от 2 до 60 символов');
    if (legacyCategories.includes(name))
      return fail(res, 400, 'Название зарезервировано для прежнего каталога');
    try {
      const result = await pool.query('INSERT INTO categories(name) VALUES($1) RETURNING name', [
        name
      ]);
      res.status(201).json(result.rows[0]);
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'Категория уже существует');
      throw e;
    }
  })
);
app.put(
  '/api/admin/categories/:name',
  authenticate,
  admin,
  safe(async (req, res) => {
    if (req.params.name === 'Без категории')
      return fail(res, 400, 'Нейтральную категорию нельзя переименовать');
    if (legacyCategories.includes(req.params.name))
      return fail(res, 403, 'Эта категория не относится к мебели');
    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 60)
      return fail(res, 400, 'Название категории: от 2 до 60 символов');
    if (legacyCategories.includes(name))
      return fail(res, 400, 'Название зарезервировано для прежнего каталога');
    try {
      const result = await pool.query(
        'UPDATE categories SET name=$1 WHERE name=$2 RETURNING name',
        [name, req.params.name]
      );
      if (!result.rowCount) return fail(res, 404, 'Категория не найдена');
      res.json(result.rows[0]);
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'Категория уже существует');
      throw e;
    }
  })
);
app.delete(
  '/api/admin/categories/:name',
  authenticate,
  admin,
  safe(async (req, res) => {
    const name = req.params.name;
    if (name === 'Без категории') return fail(res, 400, 'Эту категорию нельзя удалить');
    if (legacyCategories.includes(name))
      return fail(res, 403, 'Эта категория не относится к мебели');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE services SET category_id=(SELECT id FROM categories WHERE name='Без категории')
      WHERE category_id=(SELECT id FROM categories WHERE name=$1)`,
        [name]
      );
      const result = await client.query('DELETE FROM categories WHERE name=$1 RETURNING name', [
        name
      ]);
      await client.query('COMMIT');
      if (!result.rowCount) return fail(res, 404, 'Категория не найдена');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

app.get(
  '/api/services',
  safe(async (_req, res) => {
    const result =
      await pool.query(`SELECT s.code,s.name,s.description,s.duration AS warranty_months,
    s.price,s.discount_percent,s.image AS image_url,c.name AS category
    FROM services s JOIN categories c ON c.id=s.category_id
    WHERE s.active=true AND s.code LIKE 'FUR-%' AND s.price>0 ORDER BY s.name`);
    res.json(result.rows);
  })
);
app.post(
  '/api/admin/services',
  authenticate,
  admin,
  safe(async (req, res) => {
    const {
      code,
      name,
      description,
      category,
      warranty_months,
      price,
      image_url,
      discount_percent = 0
    } = req.body;
    const discount = Number(discount_percent);
    if (
      !/^FUR-[A-Z0-9-]{3,30}$/.test(code || '') ||
      !name?.trim() ||
      !description?.trim() ||
      !Number.isInteger(Number(price)) ||
      !(Number(price) > 0) ||
      !Number.isInteger(Number(warranty_months)) ||
      !(Number(warranty_months) > 0) ||
      !Number.isInteger(discount) ||
      discount < 0 ||
      discount > 99 ||
      (discount > 0 &&
        Math.max(1, Math.round(Number(price) * (1 - discount / 100))) >= Number(price)) ||
      !/^https?:\/\/\S+$/i.test(image_url || '')
    )
      return fail(
        res,
        400,
        'Заполните товар, код FUR-…, описание, фото, гарантию, цену больше нуля и скидку 0–99%'
      );
    try {
      const result = await pool.query(
        `INSERT INTO services(code,category_id,name,description,duration,price,discount_percent,image,active)
      SELECT $1,c.id,$2,$3,$4,$5,$6,$7,true FROM categories c
      WHERE c.name=$8 AND c.name NOT IN ('Смартфоны','Наушники') RETURNING code`,
        [
          code,
          name.trim(),
          description.trim(),
          Number(warranty_months),
          Number(price),
          discount,
          image_url.trim(),
          category
        ]
      );
      if (!result.rowCount) return fail(res, 400, 'Категория не найдена');
      res.status(201).json(result.rows[0]);
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'Код товара уже существует');
      throw e;
    }
  })
);
app.put(
  '/api/admin/services/:code',
  authenticate,
  admin,
  safe(async (req, res) => {
    const { name, description, category, warranty_months, price, image_url, discount_percent } =
      req.body;
    const discount = Number(discount_percent);
    if (
      !name?.trim() ||
      !description?.trim() ||
      !Number.isInteger(Number(price)) ||
      !(Number(price) > 0) ||
      !Number.isInteger(Number(warranty_months)) ||
      !(Number(warranty_months) > 0) ||
      !Number.isInteger(discount) ||
      discount < 0 ||
      discount > 99 ||
      (discount > 0 &&
        Math.max(1, Math.round(Number(price) * (1 - discount / 100))) >= Number(price)) ||
      !/^https?:\/\/\S+$/i.test(image_url || '')
    )
      return fail(res, 400, 'Проверьте название, описание, фото, гарантию, цену и скидку');
    const result = await pool.query(
      `UPDATE services s SET name=$1,description=$2,duration=$3,price=$4,image=$5,
    discount_percent=$6,category_id=c.id FROM categories c WHERE s.code=$7 AND c.name=$8
      AND c.name NOT IN ('Смартфоны','Наушники') AND s.code LIKE 'FUR-%' RETURNING s.code`,
      [
        name.trim(),
        description.trim(),
        Number(warranty_months),
        Number(price),
        image_url.trim(),
        discount,
        req.params.code,
        category
      ]
    );
    if (!result.rowCount) return fail(res, 404, 'Товар или категория не найдены');
    res.json(result.rows[0]);
  })
);
app.delete(
  '/api/admin/services/:code',
  authenticate,
  admin,
  safe(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE services SET active=false WHERE code=$1 AND code LIKE 'FUR-%' RETURNING id`,
        [req.params.code]
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return fail(res, 404, 'Товар не найден');
      }
      await client.query('DELETE FROM cart_items WHERE service_id=$1', [result.rows[0].id]);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

const cartQuery = `SELECT s.code,s.name,s.price,s.discount_percent,s.image AS image_url,c.name AS category,ci.quantity
  FROM cart_items ci JOIN services s ON s.id=ci.service_id JOIN categories c ON c.id=s.category_id
  WHERE ci.user_id=$1 AND s.code LIKE 'FUR-%' AND s.active=true AND s.price>0 ORDER BY s.name`;
app.get(
  '/api/cart',
  authenticate,
  customer,
  safe(async (req, res) => {
    res.json((await pool.query(cartQuery, [req.user.id])).rows);
  })
);
app.put(
  '/api/cart/:code',
  authenticate,
  customer,
  safe(async (req, res) => {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY)
      return fail(res, 400, 'Можно заказать от 1 до 10 штук товара');
    if (quantity === 0) {
      await pool.query(
        `DELETE FROM cart_items ci USING services s
      WHERE ci.service_id=s.id AND ci.user_id=$1 AND s.code=$2`,
        [req.user.id, req.params.code]
      );
      return res.json((await pool.query(cartQuery, [req.user.id])).rows);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cart'), $1)", [req.user.id]);
      const service = await client.query(
        `SELECT id FROM services WHERE code=$1 AND code LIKE 'FUR-%'
      AND active=true AND price>0 FOR SHARE`,
        [req.params.code]
      );
      if (!service.rowCount) {
        await client.query('ROLLBACK');
        return fail(res, 404, 'Товар недоступен');
      }
      const total = await client.query(
        `SELECT COALESCE(SUM(ci.quantity),0)::int AS quantity FROM cart_items ci
      JOIN services s ON s.id=ci.service_id
      WHERE ci.user_id=$1 AND ci.service_id<>$2 AND s.code LIKE 'FUR-%' AND s.active=true`,
        [req.user.id, service.rows[0].id]
      );
      if (total.rows[0].quantity + quantity > MAX_QUANTITY) {
        await client.query('ROLLBACK');
        return fail(res, 400, 'В корзине может быть не более 10 товаров суммарно');
      }
      await client.query(
        `INSERT INTO cart_items(user_id,service_id,quantity) VALUES($1,$2,$3)
      ON CONFLICT(user_id,service_id) DO UPDATE SET quantity=EXCLUDED.quantity`,
        [req.user.id, service.rows[0].id, quantity]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json((await pool.query(cartQuery, [req.user.id])).rows);
  })
);

app.post(
  '/api/cart/:code',
  authenticate,
  customer,
  safe(async (req, res) => {
    const delta = req.body?.delta === undefined ? 1 : Number(req.body.delta);
    if (delta !== 1 && delta !== -1)
      return fail(res, 400, 'Количество можно менять по одной единице');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cart'), $1)", [req.user.id]);
      const service = await client.query(
        `SELECT id FROM services WHERE code=$1 AND code LIKE 'FUR-%'
      AND active=true AND price>0 FOR SHARE`,
        [req.params.code]
      );
      if (!service.rowCount) {
        await client.query('ROLLBACK');
        return fail(res, 404, 'Товар недоступен');
      }
      const total = await client.query(
        `SELECT COALESCE(SUM(ci.quantity),0)::int AS quantity FROM cart_items ci
      JOIN services s ON s.id=ci.service_id WHERE ci.user_id=$1 AND s.code LIKE 'FUR-%' AND s.active=true`,
        [req.user.id]
      );
      if (delta === 1 && total.rows[0].quantity >= MAX_QUANTITY) {
        await client.query('ROLLBACK');
        return fail(res, 400, 'В корзине может быть не более 10 товаров суммарно');
      }
      if (delta === 1) {
        await client.query(
          `INSERT INTO cart_items(user_id,service_id,quantity) VALUES($1,$2,1)
        ON CONFLICT(user_id,service_id) DO UPDATE SET quantity=cart_items.quantity+1`,
          [req.user.id, service.rows[0].id]
        );
      } else {
        const changed = await client.query(
          `UPDATE cart_items SET quantity=quantity-1
        WHERE user_id=$1 AND service_id=$2 AND quantity>1 RETURNING quantity`,
          [req.user.id, service.rows[0].id]
        );
        if (!changed.rowCount) {
          await client.query('ROLLBACK');
          return fail(res, 400, 'Чтобы убрать последнюю единицу, удалите товар');
        }
      }
      await client.query('COMMIT');
      res.json((await pool.query(cartQuery, [req.user.id])).rows);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

const profanity =
  /(?:хуй|хуя|хуе|хуи|оху|пизд|пидор|пидр|заеб|наеб|уеб|выеб|проеб|долбо[её]б|(?:^|[^\p{L}])(?:еба|ёба|ебл|ёбл|еби|ёби|ебу|ёбу|ебн|ёбн|бля|сука|сучк|мудак|fuck|shit|bitch)[\p{L}]*|(?:^|[^\p{L}])(?:ёб|еб)(?:$|[^\p{L}]))/iu;
const reviewEligibilityQuery = `SELECT s.code,
  EXISTS (SELECT 1 FROM appointment_services i JOIN appointments a ON a.id=i.appointment_id
    JOIN payments p ON p.appointment_id=a.id
    WHERE i.service_id=s.id AND a.user_id=$1 AND p.status='Оплачено') AS purchased,
  EXISTS (SELECT 1 FROM reviews r WHERE r.service_id=s.id AND r.user_id=$1) AS reviewed
  FROM services s WHERE s.code=$2 AND s.code LIKE 'FUR-%' AND s.active=true`;
app.get(
  '/api/services/:code/reviews',
  safe(async (req, res) => {
    const result = await pool.query(
      `SELECT u.name,r.rating,r.created_at,r.deleted_by_admin,
    CASE WHEN r.deleted_by_admin THEN 'Удалено администратором за нарушение политики' ELSE r.comment END AS comment
    FROM reviews r JOIN users u ON u.id=r.user_id JOIN services s ON s.id=r.service_id
    WHERE s.code=$1 AND s.code LIKE 'FUR-%' AND (r.deleted_by_admin OR EXISTS (
      SELECT 1 FROM appointment_services i JOIN appointments a ON a.id=i.appointment_id
      JOIN payments p ON p.appointment_id=a.id
      WHERE i.service_id=s.id AND a.user_id=r.user_id AND p.status='Оплачено'))
    ORDER BY r.created_at DESC`,
      [req.params.code]
    );
    res.json(result.rows);
  })
);
app.get(
  '/api/services/:code/review-eligibility',
  authenticate,
  customer,
  safe(async (req, res) => {
    const result = await pool.query(reviewEligibilityQuery, [req.user.id, req.params.code]);
    if (!result.rowCount) return fail(res, 404, 'Товар не найден');
    res.json({
      can_review: result.rows[0].purchased && !result.rows[0].reviewed,
      purchased: result.rows[0].purchased,
      reviewed: result.rows[0].reviewed
    });
  })
);
app.post(
  '/api/services/:code/reviews',
  authenticate,
  customer,
  safe(async (req, res) => {
    const rating = Number(req.body.rating),
      comment = String(req.body.comment || '').trim();
    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      comment.length < 3 ||
      comment.length > 1000 ||
      profanity.test(comment)
    )
      return fail(
        res,
        400,
        'Отзыв должен содержать 3–1000 символов, оценку 1–5 и не содержать мат'
      );
    const eligibility = await pool.query(reviewEligibilityQuery, [req.user.id, req.params.code]);
    if (!eligibility.rowCount) return fail(res, 404, 'Товар не найден');
    if (!eligibility.rows[0].purchased)
      return fail(res, 403, 'Оставить отзыв можно после оплаты заказа с этим товаром');
    if (eligibility.rows[0].reviewed) return fail(res, 409, 'Вы уже оставили отзыв об этом товаре');
    try {
      const result = await pool.query(
        `INSERT INTO reviews(user_id,service_id,rating,comment)
      SELECT $1,s.id,$2,$3 FROM services s WHERE s.code=$4 AND s.code LIKE 'FUR-%' AND s.active=true RETURNING id`,
        [req.user.id, rating, comment, req.params.code]
      );
      if (!result.rowCount) return fail(res, 404, 'Товар не найден');
      res.status(201).json({ ok: true });
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'Вы уже оставили отзыв об этом товаре');
      throw e;
    }
  })
);
app.delete(
  '/api/admin/reviews/:code/:email',
  authenticate,
  admin,
  safe(async (req, res) => {
    const result = await pool.query(
      `UPDATE reviews r SET deleted_by_admin=true FROM services s,users u
    WHERE r.service_id=s.id AND r.user_id=u.id AND s.code=$1 AND s.code LIKE 'FUR-%' AND u.email=$2 RETURNING r.id`,
      [req.params.code, req.params.email]
    );
    if (!result.rowCount) return fail(res, 404, 'Отзыв не найден');
    res.json({ ok: true });
  })
);
app.get(
  '/api/admin/reviews',
  authenticate,
  admin,
  safe(async (_req, res) => {
    const result =
      await pool.query(`SELECT r.rating,r.comment,r.deleted_by_admin,u.name AS author,u.email,s.name AS product,s.code
    FROM reviews r JOIN users u ON u.id=r.user_id JOIN services s ON s.id=r.service_id
    WHERE s.code LIKE 'FUR-%' ORDER BY r.created_at DESC`);
    res.json(result.rows);
  })
);

app.post(
  '/api/orders',
  authenticate,
  customer,
  safe(async (req, res) => {
    const address = String(req.body.delivery_address || '').trim();
    const date = String(req.body.delivery_date || '');
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date;
    if (!address || address.length > 500 || !validDate || date < today())
      return fail(res, 400, 'Укажите адрес и дату доставки не раньше сегодня');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [date]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cart'), $1)", [req.user.id]);
      const cart = await client.query(
        `SELECT s.id,s.code,s.name,s.price,s.discount_percent,s.image,s.active,ci.quantity
      FROM cart_items ci JOIN services s ON s.id=ci.service_id
      WHERE ci.user_id=$1 AND s.code LIKE 'FUR-%' FOR UPDATE OF ci`,
        [req.user.id]
      );
      const quantity = cart.rows.reduce((sum, item) => sum + item.quantity, 0);
      if (
        !quantity ||
        quantity > MAX_QUANTITY ||
        cart.rows.some((item) => !item.active || Number(item.price) <= 0)
      ) {
        await client.query('ROLLBACK');
        return fail(res, 400, 'Корзина пуста, содержит недоступный товар или больше 10 единиц');
      }
      const booked = await client.query(
        `SELECT COALESCE(SUM(i.quantity),0)::int AS quantity
      FROM appointments a JOIN appointment_services i ON i.appointment_id=a.id JOIN services s ON s.id=i.service_id
      WHERE a.delivery_date=$1 AND a.status<>'Отменён' AND s.code LIKE 'FUR-%'`,
        [date]
      );
      if (booked.rows[0].quantity + quantity > MAX_QUANTITY) {
        await client.query('ROLLBACK');
        return fail(
          res,
          409,
          'На эту дату свободных сотрудников для доставки нет. Выберите другую дату или уменьшите количество'
        );
      }
      const previous = await client.query(
        `SELECT 1 FROM appointments a JOIN appointment_services i ON i.appointment_id=a.id
      JOIN services s ON s.id=i.service_id WHERE a.user_id=$1 AND s.code LIKE 'FUR-%' LIMIT 1`,
        [req.user.id]
      );
      const personalDiscount = previous.rowCount ? 0 : 5;
      const items = cart.rows.map((item) => ({
        code: item.code,
        name: item.name,
        image_url: item.image,
        quantity: item.quantity,
        original_price: Number(item.price),
        discount_percent: item.discount_percent,
        price: Math.max(1, Math.round(Number(item.price) * (1 - item.discount_percent / 100))),
        id: item.id
      }));
      const totalInitial = items.reduce((n, i) => n + i.original_price * i.quantity, 0);
      const discounted = items.reduce((n, i) => n + i.price * i.quantity, 0);
      const finalAmount = Math.max(1, Math.round(discounted * (1 - personalDiscount / 100)));
      const order = await client.query(
        `INSERT INTO appointments(user_id,status,total,delivery_address,delivery_date)
      VALUES($1,'Ожидает оплаты',$2,$3,$4) RETURNING id,created_at`,
        [req.user.id, finalAmount, address, date]
      );
      for (const item of items)
        await client.query(
          `INSERT INTO appointment_services
      (appointment_id,service_id,quantity,unit_price,original_price,discount_percent) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            order.rows[0].id,
            item.id,
            item.quantity,
            item.price,
            item.original_price,
            item.discount_percent
          ]
        );
      await client.query(
        `INSERT INTO payments(appointment_id,amount,status,provider) VALUES($1,$2,'Ожидает оплаты','Не выбран')`,
        [order.rows[0].id, finalAmount]
      );
      await client.query('DELETE FROM cart_items WHERE user_id=$1', [req.user.id]);
      await client.query('COMMIT');
      res
        .status(201)
        .json({
          receipt: {
            order_number: `FUR-${order.rows[0].id}`,
            date: order.rows[0].created_at,
            delivery_date: date,
            delivery_address: address,
            items: items.map(({ id: _id, ...rest }) => rest),
            total_initial: totalInitial,
            total_with_product_discounts: discounted,
            personal_discount: personalDiscount,
            personal_discount_amount: discounted - finalAmount,
            total_discount: totalInitial - finalAmount,
            final_amount: finalAmount,
            status: 'Ожидает оплаты'
          }
        });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);
app.get(
  '/api/orders',
  authenticate,
  customer,
  safe(async (req, res) => {
    const result = await pool.query(
      `SELECT a.id,a.status,a.total AS final_amount,a.created_at,a.delivery_date::text AS delivery_date,a.delivery_address,
    COALESCE(json_agg(json_build_object('name',s.name,'code',s.code,'quantity',i.quantity,
      'unit_price',i.unit_price,'original_price',i.original_price,'discount_percent',i.discount_percent))
      FILTER (WHERE s.id IS NOT NULL),'[]') AS items
    FROM appointments a LEFT JOIN appointment_services i ON i.appointment_id=a.id
    LEFT JOIN services s ON s.id=i.service_id WHERE a.user_id=$1
    AND EXISTS (SELECT 1 FROM appointment_services fi JOIN services fs ON fs.id=fi.service_id
      WHERE fi.appointment_id=a.id AND fs.code LIKE 'FUR-%')
    GROUP BY a.id ORDER BY a.id DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(({ id, ...order }) => ({ ...order, order_number: `FUR-${id}` })));
  })
);
app.get(
  '/api/admin/orders',
  authenticate,
  admin,
  safe(async (_req, res) => {
    const result =
      await pool.query(`SELECT a.id,a.status,a.total,a.delivery_date::text AS delivery_date,a.delivery_address,u.email
    FROM appointments a JOIN users u ON u.id=a.user_id
    WHERE EXISTS (SELECT 1 FROM appointment_services i JOIN services s ON s.id=i.service_id
      WHERE i.appointment_id=a.id AND s.code LIKE 'FUR-%') ORDER BY a.id DESC`);
    res.json(result.rows.map(({ id, ...order }) => ({ ...order, order_number: `FUR-${id}` })));
  })
);
app.put(
  '/api/admin/orders/:number/status',
  authenticate,
  admin,
  safe(async (req, res) => {
    const id = Number(req.params.number.replace(/^FUR-/, ''));
    const status = req.body.status;
    if (
      !Number.isInteger(id) ||
      !['Ожидает оплаты', 'Оплачено', 'В доставке', 'Доставлено', 'Отменён'].includes(status)
    )
      return fail(res, 400, 'Недопустимый статус');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT status FROM appointments a WHERE a.id=$1
      AND EXISTS (SELECT 1 FROM appointment_services i JOIN services s ON s.id=i.service_id
        WHERE i.appointment_id=a.id AND s.code LIKE 'FUR-%') FOR UPDATE`,
        [id]
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return fail(res, 404, 'Заказ не найден');
      }
      const from = current.rows[0].status;
      const payment = await client.query(
        `SELECT 1 FROM payments WHERE appointment_id=$1 AND status='Оплачено' LIMIT 1`,
        [id]
      );
      if (payment.rowCount && ['Ожидает оплаты', 'Отменён'].includes(status)) {
        await client.query('ROLLBACK');
        return fail(res, 409, 'Оплаченный заказ нельзя вернуть к ожиданию оплаты или отменить');
      }
      const allowed = {
        'Ожидает оплаты': ['Оплачено', 'Отменён'],
        Оформлен: ['Оплачено', 'Отменён'],
        Оплачено: ['В доставке'],
        'В доставке': ['Доставлено'],
        Доставлено: [],
        Отменён: []
      };
      if (!allowed[from]?.includes(status)) {
        await client.query('ROLLBACK');
        return fail(
          res,
          409,
          'Нельзя вернуть оплаченный заказ к ожиданию оплаты или изменить завершённый заказ'
        );
      }
      await client.query('UPDATE appointments SET status=$1 WHERE id=$2', [status, id]);
      if (status === 'Оплачено')
        await client.query(`UPDATE payments SET status='Оплачено' WHERE appointment_id=$1`, [id]);
      await client.query('COMMIT');
      res.json({ ok: true, status });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

app.use((err, _req, res, _next) => {
  console.error(err);
  fail(res, 500, 'Ошибка сервера');
});
const PORT = Number(process.env.PORT || 5000);
pool
  .query('SELECT 1 FROM services LIMIT 1')
  .then(() =>
    app.listen(PORT, () => console.log(`API «Мебельный магазин» запущен на порту ${PORT}`))
  )
  .catch((err) => {
    console.error('Ошибка подключения к БД:', err);
    process.exitCode = 1;
    pool.end();
  });
