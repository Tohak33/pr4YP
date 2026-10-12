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
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (comment.trim().length < 3) return setError('Напишите отзыв длиной минимум 3 символа');
    setSaving(true);
    try {
      await api(`/services/${encodeURIComponent(code)}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating: Number(rating), comment: comment.trim() })
      });
      setEligibility({ can_review: false, purchased: true, reviewed: true });
      setComment('');
      setReviews(await api(`/services/${encodeURIComponent(code)}/reviews`));
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
      {user?.role !== 'admin' && !loading && eligibility?.purchased && eligibility.reviewed && (
        <p>Вы уже оставили отзыв на этот товар.</p>
      )}
      {user?.role !== 'admin' && !loading && eligibility && !eligibility.purchased && (
        <p>Отзыв можно оставить после оплаты заказа с этим товаром.</p>
      )}
      {eligibility?.can_review && !loading && (
        <form onSubmit={submit}>
          <label>
            Оценка{' '}
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
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
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn-small" disabled={saving}>
            {saving ? 'Отправка...' : 'Оставить отзыв'}
          </button>
        </form>
      )}
    </div>
  );
}
