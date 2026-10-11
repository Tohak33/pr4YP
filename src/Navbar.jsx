import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext, CartContext } from './contexts';

export default function Navbar() {
  const { user, ready, logout } = useContext(AuthContext);
  const [loggingOut, setLoggingOut] = useState(false);
  const { cartItems } = useContext(CartContext);
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  return <header className="navbar"><div className="nav-brand"><Link to="/">Мебельный магазин</Link><small>Мебель для жизни</small></div>
    <nav className="nav-links"><Link to="/">Каталог</Link>
      {ready && user && !isAdmin && <Link to="/cart">Корзина <span className="badge">{cartItems.reduce((n, i) => n + i.quantity, 0)}</span></Link>}
      {ready && isAdmin && <Link to="/admin">Управление</Link>}
      {ready && user ? <><Link to="/profile">Профиль</Link><button className="btn-logout" disabled={loggingOut} onClick={async () => { setLoggingOut(true); await logout(); navigate('/login'); setLoggingOut(false); }}>{loggingOut ? 'Выход...' : 'Выйти'}</button></>
        : ready && <><Link to="/login">Войти</Link><Link to="/register">Регистрация</Link></>}
    </nav></header>;
}
