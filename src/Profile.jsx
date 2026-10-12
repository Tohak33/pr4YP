import { useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from './contexts';
import { api } from './api';
import { formatPhone, validName, validPhone } from './validation';

export default function Profile() {
  const { user, ready } = useContext(AuthContext);
  if (!ready) return <div className="info-message">Загрузка профиля...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <ProfileContent user={user} />;
}

function ProfileContent({ user }) {
  const { updateUser } = useContext(AuthContext);
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email,
    phone: user.phone || '+7 ',
    address: user.address || '',
    password: ''
  });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(user.role !== 'admin');
  const [ordersError, setOrdersError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (user.role === 'admin') return;
    api('/orders')
      .then(setOrders)
      .catch((err) => setOrdersError(err.message))
      .finally(() => setOrdersLoading(false));
  }, [user.role]);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!validName(form.name)) return setError('Укажите настоящие имя и фамилию');
    if (!validPhone(form.phone)) return setError('Телефон: +7 (999) 999-99-99');
    if (form.password && form.password.length < 8)
      return setError('Пароль должен содержать минимум 8 символов');
    setLoading(true);
    try {
      const data = await api('/auth/profile', { method: 'PUT', body: JSON.stringify(form) });
      updateUser(data.user);
      change('password', '');
      setMessage('Данные сохранены');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="profile-container">
      <h1>Личный кабинет</h1>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}
      <div className="profile-sections">
        <form className="profile-form card" onSubmit={submit}>
          <h3>Мои данные</h3>
          <div className="form-group">
            <label>Фамилия и имя</label>
            <input required value={form.name} onChange={(e) => change('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => change('email', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Телефон · +7 (999) 999-99-99</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => change('phone', formatPhone(e.target.value))}
            />
          </div>
          {user.role !== 'admin' && (
            <div className="form-group">
              <label>Адрес доставки по умолчанию</label>
              <textarea
                rows="2"
                value={form.address}
                onChange={(e) => change('address', e.target.value)}
              />
            </div>
          )}
          <div className="form-group">
            <label>Новый пароль</label>
            <input
              type="password"
              placeholder="Оставьте пустым, чтобы не менять"
              value={form.password}
              onChange={(e) => change('password', e.target.value)}
            />
          </div>
          <button className="btn-primary" disabled={loading}>
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
        {user.role !== 'admin' && (
          <section className="order-history card">
            <h3>Мои заказы</h3>
            {ordersLoading && <div className="info-message">Загрузка заказов...</div>}
            {ordersError && <div className="error-message">{ordersError}</div>}
            {!ordersLoading && !ordersError && !orders.length && (
              <p className="empty-message">Заказов пока нет</p>
            )}
            {orders.map((order) => (
              <article className="order-box" key={order.order_number}>
                <div className="order-header">
                  <strong>№ {order.order_number}</strong>
                  <span>{new Date(order.created_at).toLocaleDateString('ru-RU')}</span>
                  <span className="order-status">{order.status}</span>
                </div>
                <p>
                  Доставка:{' '}
                  {order.delivery_date
                    ? new Date(`${order.delivery_date}T00:00:00`).toLocaleDateString('ru-RU')
                    : '—'}
                  , {order.delivery_address}
                </p>
                <ul className="order-items-sublist">
                  {order.items.map((item) => (
                    <li key={item.code}>
                      <span>
                        {item.name} × {item.quantity}
                      </span>
                      <span>
                        {(Number(item.unit_price) * item.quantity).toLocaleString('ru-RU')} ₽
                      </span>
                    </li>
                  ))}
                </ul>
                {Number(order.final_amount) <
                  order.items.reduce(
                    (sum, item) => sum + Number(item.unit_price) * item.quantity,
                    0
                  ) && (
                  <p>
                    Скидка на первый заказ:{' '}
                    {(
                      order.items.reduce(
                        (sum, item) => sum + Number(item.unit_price) * item.quantity,
                        0
                      ) - Number(order.final_amount)
                    ).toLocaleString('ru-RU')}{' '}
                    ₽
                  </p>
                )}
                <div className="order-footer">
                  Общая сумма заказа:{' '}
                  <strong>{Number(order.final_amount).toLocaleString('ru-RU')} ₽</strong>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
