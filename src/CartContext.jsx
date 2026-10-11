import { useContext, useEffect, useState } from 'react';
import { AuthContext, CartContext, MAX_QUANTITY } from './contexts';
import { api } from './api';

// Корзина всегда загружается с сервера для текущей учётной записи.
export function CartProvider({ children }) {
  const { user, ready } = useContext(AuthContext);
  const email = user?.email;
  const role = user?.role;
  const [cart, setCart] = useState({ owner: null, items: [] });
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const cartItems = cart.owner === email ? cart.items : [];
  const loading = Boolean(ready && email && role !== 'admin' && cart.owner !== email);
  useEffect(() => {
    if (!ready || !email || role === 'admin') return;
    let active = true;
    api('/cart').then(items => { if (active) { setCart({ owner: email, items }); setError(''); } })
      .catch(err => { if (active) { setError(err.message); setCart({ owner: email, items: [] }); } });
    return () => { active = false; };
  }, [email, role, ready]);
  const changeQuantity = async (code, quantity) => {
    setError('');
    if (quantity > MAX_QUANTITY || cartItems.reduce((sum, item) => sum + (item.code === code ? 0 : item.quantity), 0) + quantity > MAX_QUANTITY) {
      const error = new Error('В корзине может быть не более 10 товаров суммарно');
      setError(error.message); throw error;
    }
    setUpdating(true);
    try {
      const items = await api(`/cart/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
      setCart({ owner: email, items });
    } catch (err) { setError(err.message); throw err; } finally { setUpdating(false); }
  };
  const addToCart = product => changeQuantity(product.code, (cartItems.find(item => item.code === product.code)?.quantity || 0) + 1);
  const updateQuantity = (code, delta) => changeQuantity(code, (cartItems.find(item => item.code === code)?.quantity || 0) + delta);
  const removeFromCart = code => changeQuantity(code, 0);
  return <CartContext.Provider value={{ cartItems, loading, updating, error, addToCart, updateQuantity, removeFromCart, clearCart: () => setCart({ owner: email, items: [] }) }}>{children}</CartContext.Provider>;
}
