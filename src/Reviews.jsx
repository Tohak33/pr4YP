import { useContext, useEffect, useState } from 'react';
import { AuthContext } from './contexts';
import { api } from './api';

// Отзывы видны всем; создание доступно только покупателю и проверяется API.
export default function Reviews({ code }) {
  const { user } = useContext(AuthContext);
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api(`/services/${encodeURIComponent(code)}/reviews`).then(setReviews).catch(err => setError(err.message)).finally(() => setLoading(false)); }, [code]);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (comment.trim().length < 3) return setError('Напишите отзыв длиной минимум 3 символа');
    setSaving(true);
    try {
      await api(`/services/${encodeURIComponent(code)}/reviews`, { method: 'POST', body: JSON.stringify({ rating: Number(rating), comment: comment.trim() }) });
      setComment(''); setReviews(await api(`/services/${encodeURIComponent(code)}/reviews`));
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <div className="reviews"><h4>Отзывы</h4>{loading && <p>Загрузка...</p>}{error && <div className="error-message">{error}</div>}
    {!loading && !reviews.length && <p>Отзывов пока нет</p>}
    {reviews.map((review, index) => <div className="review" key={`${review.created_at}-${index}`}><strong>{review.name}</strong><span> {'★'.repeat(review.rating)}</span><p>{review.comment}</p></div>)}
    {user && user.role !== 'admin' && <form onSubmit={submit}><label>Оценка <select value={rating} onChange={e => setRating(e.target.value)}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <textarea required minLength="3" maxLength="1000" placeholder="Расскажите о товаре" value={comment} onChange={e => setComment(e.target.value)} />
      <button className="btn-small" disabled={saving}>{saving ? 'Отправка...' : 'Оставить отзыв'}</button></form>}
  </div>;
}
