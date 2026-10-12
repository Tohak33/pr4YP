import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from './contexts';
import { api } from './api';

export default function Reviews({ code }) {
  const { user } = useContext(AuthContext);
  const isCustomer = Boolean(user && user.role !== 'admin');
  const [reviews, setReviews] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const myReview = eligibility?.my_review;
  useEffect(() => {
    let active = true;
    const path = `/services/${encodeURIComponent(code)}`;
    Promise.all([
      api(`${path}/reviews`),
      isCustomer ? api(`${path}/review-eligibility`) : Promise.resolve(null)
    ])
      .then(([items, access]) => {
        if (active) {
          setReviews(items);
          setEligibility(access);
          setError('');
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
  }, [code, isCustomer, user?.email]);
  async function refreshReviews() {
    const path = `/services/${encodeURIComponent(code)}`;
    const [items, access] = await Promise.all([
      api(`${path}/reviews`),
      api(`${path}/review-eligibility`)
    ]);
    setReviews(items);
    setEligibility(access);
  }
  function startEditing() {
    setRating(myReview.rating);
    setComment(myReview.comment);
    setEditing(true);
    setError('');
    setMessage('');
  }
  function cancelEditing() {
    setEditing(false);
    setComment('');
    setRating(5);
    setError('');
  }
  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (comment.trim().length < 3) return setError('Напишите отзыв длиной минимум 3 символа');
    setSaving(true);
    try {
      await api(`/services/${encodeURIComponent(code)}/reviews`, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ rating: Number(rating), comment: comment.trim() })
      });
      await refreshReviews();
      setMessage(editing ? 'Отзыв изменён' : 'Отзыв добавлен');
      setEditing(false);
      setComment('');
      setRating(5);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  async function removeReview() {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api(`/services/${encodeURIComponent(code)}/reviews`, { method: 'DELETE' });
      await refreshReviews();
      setEditing(false);
      setComment('');
      setRating(5);
      setMessage('Отзыв удалён');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="reviews">
      <h4>Отзывы</h4>
      {loading && <p>Загрузка...</p>}
      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      {!loading && !error && !reviews.length && <p>Отзывов пока нет</p>}
      {reviews.map((review, index) => (
        <div className="review" key={`${review.created_at}-${index}`}>
          <strong>{review.name}</strong>
          <span> {'★'.repeat(review.rating)}</span>
          <p>{review.comment}</p>
        </div>
      ))}
      {!user && !loading && (
        <p>
          Чтобы оставить отзыв, <Link to="/login">войдите в аккаунт</Link>.
        </p>
      )}
      {isCustomer && !loading && myReview && !myReview.deleted_by_admin && !editing && (
        <div>
          <p>Вы уже оставили отзыв на этот товар.</p>
          <div className="form-actions">
            <button
              className="btn-small"
              disabled={saving || !eligibility.purchased}
              onClick={startEditing}
            >
              Изменить отзыв
            </button>
            <button className="btn-remove" disabled={saving} onClick={removeReview}>
              Удалить отзыв
            </button>
          </div>
        </div>
      )}
      {isCustomer && !loading && myReview?.deleted_by_admin && (
        <p>Ваш отзыв удалён администратором за нарушение политики.</p>
      )}
      {user?.role !== 'admin' && !loading && eligibility && !eligibility.purchased && (
        <p>Отзыв можно оставить после оплаты заказа с этим товаром.</p>
      )}
      {isCustomer && (eligibility?.can_review || editing) && !loading && (
        <form onSubmit={submit}>
          {editing && <h4>Изменить отзыв</h4>}
          <label>
            Оценка{' '}
            <select disabled={saving} value={rating} onChange={(e) => setRating(e.target.value)}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <textarea
            required
            minLength="3"
            maxLength="1000"
            placeholder="Расскажите о товаре"
            value={comment}
            disabled={saving}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="form-actions">
            <button className="btn-small" disabled={saving}>
              {saving ? 'Сохранение...' : editing ? 'Сохранить изменения' : 'Оставить отзыв'}
            </button>
            {editing && (
              <button
                type="button"
                className="review-toggle"
                disabled={saving}
                onClick={cancelEditing}
              >
                Отмена
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
