// «Мебельный магазин»: корневые маршруты и экран технических работ.
import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { AuthProvider } from './AuthContext';
import { CartProvider } from './CartContext';
import Navbar from './Navbar';
import Catalog from './Catalog';
import Cart from './Cart';
import Login from './Login';
import Register from './Register';
import Profile from './Profile';
import Admin from './Admin';
import ResetPassword from './ResetPassword';

function Pages() {
  const [offline, setOffline] = useState(false);
  const wasOffline = useRef(false);
  const check = () => api('/health').then(() => {
    setOffline(false);
    if (wasOffline.current) { wasOffline.current = false; window.dispatchEvent(new Event('furniture:online')); }
  }).catch(() => { wasOffline.current = true; setOffline(true); });
  useEffect(() => {
    const onOffline = () => { wasOffline.current = true; setOffline(true); };
    check();
    const interval = setInterval(check, 15000);
    window.addEventListener('furniture:offline', onOffline);
    return () => { clearInterval(interval); window.removeEventListener('furniture:offline', onOffline); };
  }, []);
  if (offline) return <main className="maintenance"><span>🛠️</span><h1>Ведутся технические работы</h1><p>Магазин скоро снова будет доступен.</p><button onClick={check}>Повторить</button></main>;
  return <BrowserRouter><Navbar /><div className="container"><Routes>
    <Route path="/" element={<Catalog />} />
    <Route path="/cart" element={<Cart />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="*" element={<div className="empty-message">Страница не найдена</div>} />
  </Routes></div></BrowserRouter>;
}
export default function App() { return <AuthProvider><CartProvider><Pages /></CartProvider></AuthProvider>; }
