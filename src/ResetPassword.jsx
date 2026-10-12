import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await api(sent ? '/auth/reset' : '/auth/forgot', {
        method: 'POST',
        body: JSON.stringify(sent ? { email, code, password } : { email })
      });
      setMessage(data.message);
      if (sent) {
        setDone(true);
        setCode('');
        setPassword('');
      } else setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  if (done)
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Пароль изменён</h2>
          <p>{message}</p>
          <Link to="/login">Войти с новым паролем</Link>
        </div>
      </div>
    );
  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={submit}>
        <h2>Восстановление пароля</h2>
        {message && <div className="success-message">{message}</div>}
        {error && <div className="error-message">{error}</div>}
        <div className="form-group">
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {sent && (
          <>
            <div className="form-group">
              <label>Код из письма</label>
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength="6"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Новый пароль</label>
              <input
                type="password"
                minLength="8"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </>
        )}
        <button className="btn-primary" disabled={loading}>
          {loading ? 'Подождите...' : sent ? 'Сбросить пароль' : 'Отправить код'}
        </button>
        {sent && (
          <button type="button" className="text-button" onClick={() => setSent(false)}>
            Получить новый код
          </button>
        )}
        <p className="auth-hint">
          <Link to="/login">Вернуться ко входу</Link>
        </p>
      </form>
    </div>
  );
}
