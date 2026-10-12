import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import { AuthContext } from './contexts';
import { formatPhone, validName, validPhone } from './validation';

export default function Register() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '+7 ', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!validName(form.name)) return setError('Укажите имя и фамилию с заглавных букв');
    if (!validPhone(form.phone))
      return setError('Телефон должен быть в формате +7 (999) 999-99-99');
    if (form.password.length < 8) return setError('Пароль должен содержать минимум 8 символов');
    setLoading(true);
    try {
      const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(form) });
      login(data);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={submit}>
        <h2>Создать аккаунт</h2>
        {error && <div className="error-message">{error}</div>}
        <div className="form-group">
          <label>Фамилия и имя</label>
          <input
            required
            placeholder="Иванов Иван"
            value={form.name}
            onChange={(e) => change('name', e.target.value)}
          />
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
          <label>Телефон</label>
          <input
            type="tel"
            required
            placeholder="+7 (999) 999-99-99"
            value={form.phone}
            onChange={(e) => change('phone', formatPhone(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label>Пароль</label>
          <input
            type="password"
            minLength="8"
            required
            value={form.password}
            onChange={(e) => change('password', e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={loading}>
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
        <p className="auth-hint">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </div>
  );
}
