import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import { AuthContext } from './contexts';

// Форма входа проверяет обязательные поля и показывает ответ API.
export default function Login() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) return setError('Заполните email и пароль');
    setLoading(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      login(data);
      navigate(data.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={submit}>
        <h2>Вход в аккаунт</h2>
        {error && <div className="error-message">{error}</div>}
        <div className="form-group">
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Пароль</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={loading}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
        <p className="auth-hint">
          <Link to="/reset-password">Забыли пароль?</Link>
        </p>
        <p className="auth-hint">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  );
}
