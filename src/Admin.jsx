import { useContext, useEffect, useState } from 'react';
import { AuthContext } from './contexts';
import { api } from './api';

const emptyProduct = {
  code: '',
  name: '',
  description: '',
  category: 'Без категории',
  warranty_months: 12,
  price: '',
  discount_percent: 0,
  image_url: ''
};
const transitions = {
  'Ожидает оплаты': ['Оплачено', 'Отменён'],
  Оплачено: ['В доставке'],
  'В доставке': ['Доставлено']
};

export default function Admin() {
  const { user, ready } = useContext(AuthContext);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [product, setProduct] = useState(emptyProduct);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function reload() {
    const [groups, items, purchases, feedback] = await Promise.all([
      api('/categories'),
      api('/services'),
      api('/admin/orders'),
      api('/admin/reviews')
    ]);
    setCategories(groups);
    setProducts(items);
    setOrders(purchases);
    setReviews(feedback);
  }
  useEffect(() => {
    if (!ready || user?.role !== 'admin') return;
    let active = true;
    Promise.all([api('/categories'), api('/services'), api('/admin/orders'), api('/admin/reviews')])
      .then(([groups, items, purchases, feedback]) => {
        if (active) {
          setCategories(groups);
          setProducts(items);
          setOrders(purchases);
          setReviews(feedback);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ready, user?.role]);
  if (!ready) return <div className="info-message">Проверка доступа...</div>;
  if (user?.role !== 'admin')
    return (
      <div className="access-denied">
        <h1>Доступ запрещён</h1>
        <p>Раздел доступен только администратору.</p>
      </div>
    );
  async function run(action, success) {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await action();
      await reload();
      setMessage(success);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  const updateProduct = (key, value) => setProduct((current) => ({ ...current, [key]: value }));
  async function submitProduct(event) {
    event.preventDefault();
    if (!Number.isInteger(Number(product.price)) || Number(product.price) <= 0)
      return setError('Цена должна быть целым числом рублей больше нуля');
    if (
      Number(product.discount_percent) > 0 &&
      Math.max(
        1,
        Math.round(Number(product.price) * (1 - Number(product.discount_percent) / 100))
      ) >= Number(product.price)
    )
      return setError('Укажите скидку, которая действительно уменьшает цену');
    if (!product.image_url?.trim()) return setError('Укажите ссылку на фото товара');
    const saved = await run(
      () =>
        api(editing ? `/admin/services/${encodeURIComponent(product.code)}` : '/admin/services', {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(product)
        }),
      'Товар сохранён'
    );
    if (saved) {
      setProduct(emptyProduct);
      setEditing(false);
    }
  }
  async function submitCategory(event) {
    event.preventDefault();
    const saved = await run(
      () =>
        api('/admin/categories', {
          method: 'POST',
          body: JSON.stringify({ name: newCategory.trim() })
        }),
      'Категория создана'
    );
    if (saved) setNewCategory('');
  }
  const visible = products.filter((item) =>
    `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="admin-page">
      <h1>Управление магазином</h1>
      <p className="admin-intro">Мебель, категории, заказы и модерация отзывов</p>
      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      {loading && <div className="info-message">Загрузка данных...</div>}
      <section className="admin-section card">
        <h2>Категории</h2>
        <form className="form-inline" onSubmit={submitCategory}>
          <input
            required
            minLength="2"
            placeholder="Новая категория"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button className="btn-primary" disabled={saving}>
            Создать
          </button>
        </form>
        <div className="category-chips">
          {categories.map((item) => (
            <span key={item.name}>
              {item.name}{' '}
              {item.name !== 'Без категории' && (
                <>
                  <button
                    disabled={saving}
                    title="Переименовать"
                    onClick={() => {
                      setRenameFrom(item.name);
                      setRenameTo(item.name);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    disabled={saving}
                    title="Переместить товары в Без категории и удалить"
                    onClick={() =>
                      run(
                        () =>
                          api(`/admin/categories/${encodeURIComponent(item.name)}`, {
                            method: 'DELETE'
                          }),
                        'Категория удалена, товары перемещены в «Без категории»'
                      )
                    }
                  >
                    ×
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
        {renameFrom && (
          <form
            className="form-inline rename-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await run(
                () =>
                  api(`/admin/categories/${encodeURIComponent(renameFrom)}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name: renameTo })
                  }),
                'Категория переименована'
              );
              if (saved) {
                setRenameFrom('');
                setRenameTo('');
              }
            }}
          >
            <input
              required
              minLength="2"
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
            />
            <button className="btn-small" disabled={saving}>
              Переименовать
            </button>
            <button type="button" className="review-toggle" onClick={() => setRenameFrom('')}>
              Отмена
            </button>
          </form>
        )}
      </section>
      <section className="admin-section card">
        <h2>{editing ? 'Редактировать товар' : 'Добавить мебель'}</h2>
        <form className="product-form" onSubmit={submitProduct}>
          <label>
            Код товара
            <input
              required
              disabled={editing}
              pattern="FUR-[A-Z0-9-]{3,30}"
              placeholder="FUR-SOFA-03"
              value={product.code}
              onChange={(e) => updateProduct('code', e.target.value)}
            />
          </label>
          <label>
            Название
            <input
              required
              value={product.name}
              onChange={(e) => updateProduct('name', e.target.value)}
            />
          </label>
          <label>
            Категория
            <select
              value={product.category}
              onChange={(e) => updateProduct('category', e.target.value)}
            >
              {categories.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            Цена, ₽
            <input
              type="number"
              min="1"
              step="1"
              required
              value={product.price}
              onChange={(e) => updateProduct('price', e.target.value)}
            />
          </label>
          <label>
            Гарантия, мес.
            <input
              type="number"
              min="1"
              required
              value={product.warranty_months}
              onChange={(e) => updateProduct('warranty_months', e.target.value)}
            />
          </label>
          <label>
            Скидка, %
            <input
              type="number"
              min="0"
              max="99"
              required
              value={product.discount_percent}
              onChange={(e) => updateProduct('discount_percent', e.target.value)}
            />
          </label>
          <label>
            Ссылка на фото
            <input
              type="url"
              required
              value={product.image_url}
              onChange={(e) => updateProduct('image_url', e.target.value)}
            />
          </label>
          <label className="wide">
            Описание
            <textarea
              rows="3"
              required
              value={product.description}
              onChange={(e) => updateProduct('description', e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить товар'}
            </button>
            {editing && (
              <button
                type="button"
                className="btn-small"
                onClick={() => {
                  setProduct(emptyProduct);
                  setEditing(false);
                }}
              >
                Отмена
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="admin-section card">
        <h2>Товары</h2>
        <input
          className="search-input"
          placeholder="Поиск товара..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Категория</th>
                <th>Цена</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.code}>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>{Number(item.price).toLocaleString('ru-RU')} ₽</td>
                  <td>
                    <button
                      className="btn-small"
                      onClick={() => {
                        setProduct(item);
                        setEditing(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Изменить
                    </button>{' '}
                    <button
                      className="btn-remove"
                      disabled={saving}
                      onClick={() =>
                        run(
                          () =>
                            api(`/admin/services/${encodeURIComponent(item.code)}`, {
                              method: 'DELETE'
                            }),
                          'Товар удалён из каталога'
                        )
                      }
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-section card">
        <h2>Заказы</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Покупатель</th>
                <th>Дата доставки</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Следующий шаг</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.order_number}>
                  <td>{order.order_number}</td>
                  <td>{order.email}</td>
                  <td>
                    {order.delivery_date
                      ? new Date(`${order.delivery_date}T00:00:00`).toLocaleDateString('ru-RU')
                      : '—'}
                  </td>
                  <td>{Number(order.total).toLocaleString('ru-RU')} ₽</td>
                  <td>{order.status}</td>
                  <td>
                    {(transitions[order.status] || []).map((next) => (
                      <button
                        className="btn-small"
                        disabled={saving}
                        key={next}
                        onClick={() =>
                          run(
                            () =>
                              api(
                                `/admin/orders/${encodeURIComponent(order.order_number)}/status`,
                                { method: 'PUT', body: JSON.stringify({ status: next }) }
                              ),
                            'Статус заказа изменён'
                          )
                        }
                      >
                        {next}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-section card">
        <h2>Отзывы</h2>
        {!reviews.length && <p>Отзывов пока нет</p>}
        {reviews.map((review) => (
          <div className="moderation-review" key={`${review.code}-${review.email}`}>
            <strong>{review.product}</strong> · {review.author} · {'★'.repeat(review.rating)}
            <p>
              {review.deleted_by_admin
                ? 'Удалено администратором за нарушение политики'
                : review.comment}
            </p>
            {!review.deleted_by_admin && (
              <button
                className="btn-remove"
                disabled={saving}
                onClick={() =>
                  run(
                    () =>
                      api(
                        `/admin/reviews/${encodeURIComponent(review.code)}/${encodeURIComponent(review.email)}`,
                        { method: 'DELETE' }
                      ),
                    'Отзыв скрыт с отметкой о нарушении политики'
                  )
                }
              >
                Удалить за нарушение
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
