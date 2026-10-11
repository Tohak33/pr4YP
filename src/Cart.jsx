import { useContext, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext, CartContext, MAX_QUANTITY } from './contexts';
import { api } from './api';
import ReceiptModal from './ReceiptModal';

// Маршрут корзины ждёт восстановления сессии перед проверкой доступа.
export default function Cart() {
  const { user, ready } = useContext(AuthContext);
  if (!ready) return <div className="info-message">Загрузка корзины...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <div className="error-message">Доступ запрещён</div>;
  return <CartContent key={user.email} user={user} />;
}

// Оформление отправляет адрес и дату, а итоговую сумму считает сервер.
function CartContent({ user }) {
  const { cartItems, loading: cartLoading, updating, error: cartError, updateQuantity, removeFromCart, clearCart } = useContext(CartContext);
  const [address, setAddress] = useState(user.address || '');
  const [date, setDate] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minDate] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }));
  const totalQuantity = cartItems.reduce((n, item) => n + item.quantity, 0);
  const subtotal = cartItems.reduce((n, item) => n + Math.max(1, Math.round(Number(item.price) * (1 - item.discount_percent / 100))) * item.quantity, 0);
  async function checkout(event) {
    event.preventDefault(); setError('');
    if (!address.trim() || !date || date < minDate) return setError('Укажите адрес и дату доставки не раньше сегодня');
    if (totalQuantity > MAX_QUANTITY) return setError('В одном заказе может быть не более 10 товаров');
    setLoading(true);
    try { const data = await api('/orders', { method: 'POST', body: JSON.stringify({ delivery_address: address.trim(), delivery_date: date }) }); clearCart(); setReceipt(data.receipt); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return <div className="cart-page"><h1>Корзина</h1>{cartError && <div className="error-message">{cartError}</div>}{error && <div className="error-message">{error}</div>}
    {cartLoading && <div className="info-message">Загрузка корзины...</div>}
    {updating && <div className="info-message">Обновление корзины...</div>}
    {!cartLoading && !cartItems.length && <p className="empty-message">В корзине пока нет товаров</p>}
    {!!cartItems.length && <div className="cart-content"><div className="cart-items-table">{cartItems.map(item => <div className="cart-item-row" key={item.code}>
      <img className="cart-item-image" src={item.image_url} alt={item.name} loading="lazy" /><div className="cart-item-details"><h3>{item.name}</h3><p>{item.category}</p><strong>{Math.max(1, Math.round(Number(item.price) * (1 - item.discount_percent / 100)))} ₽</strong></div>
      <div className="quantity-controls"><button aria-label="Уменьшить" disabled={updating || item.quantity <= 1} onClick={() => updateQuantity(item.code, -1).catch(err => setError(err.message))}>−</button><span>{item.quantity}</span>
        <button aria-label="Увеличить" disabled={updating || totalQuantity >= MAX_QUANTITY} onClick={() => updateQuantity(item.code, 1).catch(err => setError(err.message))}>+</button></div>
      <button className="btn-remove" disabled={updating} onClick={() => removeFromCart(item.code).catch(err => setError(err.message))}>Удалить</button></div>)}</div>
      <form className="checkout-sidebar" onSubmit={checkout}><h2>Оформление</h2><p>Всего товаров: {totalQuantity} из {MAX_QUANTITY}</p>
        <div className="form-group"><label>Адрес доставки</label><textarea required rows="3" value={address} onChange={e => setAddress(e.target.value)} /></div>
        <div className="form-group"><label>Дата доставки</label><input type="date" required min={minDate} value={date} onChange={e => setDate(e.target.value)} /></div>
        <p className="capacity-note">На каждый день доступно не более 10 единиц мебели по всем категориям.</p>
        <div className="summary-row total-row"><span>Стоимость товаров</span><strong>{subtotal.toLocaleString('ru-RU')} ₽</strong></div>
        <p className="capacity-note">Скидка 5% применяется только к первому заказу; итог подтвердит сервер.</p>
        <button className="btn-primary btn-checkout" disabled={loading || updating}>{loading ? 'Оформление...' : 'Оформить заказ'}</button>
      </form></div>}
    <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /></div>;
}
