import { useState } from 'react';
import Reviews from './Reviews';

export default function ProductCard({ product, user, onAdd, cartBusy }) {
  const [showReviews, setShowReviews] = useState(false);
  const [adding, setAdding] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const price = Math.max(
    1,
    Math.round(Number(product.price) * (1 - product.discount_percent / 100))
  );
  async function add() {
    setAdding(true);
    try {
      await onAdd(product);
    } finally {
      setAdding(false);
    }
  }
  return (
    <article className="product-card">
      <div className="product-image-container">
        {product.image_url && failedImageUrl !== product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            onError={() => setFailedImageUrl(product.image_url)}
          />
        ) : (
          <span className="furniture-placeholder">Фото недоступно</span>
        )}
        {product.discount_percent > 0 && (
          <span className="discount-tag">−{product.discount_percent}%</span>
        )}
      </div>
      <div className="product-info">
        <span className="product-code">{product.category}</span>
        <h3 className="product-title">{product.name}</h3>
        <p className="product-desc">{product.description}</p>
        <span className="product-duration">Гарантия {product.warranty_months} мес.</span>
        <div className="price-row">
          {product.discount_percent > 0 && (
            <span className="old-price">{Number(product.price).toLocaleString('ru-RU')} ₽</span>
          )}
          <strong className="current-price">{price.toLocaleString('ru-RU')} ₽</strong>
        </div>
      </div>
      <div className="product-actions">
        {user?.role !== 'admin' && (
          <button className="btn-add-cart" disabled={adding || (user && cartBusy)} onClick={add}>
            {adding ? 'Добавление...' : user ? 'В корзину' : 'Войти для покупки'}
          </button>
        )}
        <button className="review-toggle" onClick={() => setShowReviews(!showReviews)}>
          {showReviews ? 'Скрыть отзывы' : 'Отзывы'}
        </button>
      </div>
      {showReviews && <Reviews code={product.code} />}
    </article>
  );
}
