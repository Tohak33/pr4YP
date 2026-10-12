import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext, CartContext } from './contexts';
import { api } from './api';
import CategoryAside from './CategoryAside';
import ProductCard from './ProductCard';

export default function Catalog() {
  const { user } = useContext(AuthContext);
  const { addToCart, loading: cartLoading, updating: cartUpdating } = useContext(CartContext);
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    Promise.all([api('/services'), api('/categories')])
      .then(([items, groups]) => {
        setProducts(items);
        setCategories(groups);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  const visible = products.filter(
    (product) =>
      (!category || product.category === category) &&
      (!maxPrice ||
        Math.max(1, Math.round(Number(product.price) * (1 - product.discount_percent / 100))) <=
          Number(maxPrice)) &&
      `${product.name} ${product.description} ${product.category}`
        .toLocaleLowerCase('ru-RU')
        .includes(search.trim().toLocaleLowerCase('ru-RU'))
  );
  async function add(product) {
    if (!user) return navigate('/login');
    if (cartLoading || cartUpdating) return;
    setError('');
    setMessage('');
    try {
      await addToCart(product);
      setMessage(`${product.name} добавлен в корзину`);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <>
      <div className="catalog-hero">
        <h1>Мебель, с которой хочется жить</h1>
        <p>Продуманные вещи для гостиной, спальни и рабочего пространства.</p>
      </div>
      <div className="catalog-layout">
        <CategoryAside categories={categories} selected={category} onSelect={setCategory} />
        <main className="catalog-main">
          <div className="catalog-toolbar">
            <input
              className="search-input"
              type="search"
              placeholder="Найти мебель..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <input
              className="price-input"
              type="number"
              min="1"
              placeholder="Цена до, ₽"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
          {loading && <div className="info-message">Загрузка каталога...</div>}
          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}
          {!loading && !error && (
            <>
              <p className="results-count">Найдено товаров: {visible.length}</p>
              <div className="product-grid">
                {visible.map((product) => (
                  <ProductCard
                    key={product.code}
                    product={product}
                    user={user}
                    onAdd={add}
                    cartBusy={cartLoading || cartUpdating}
                  />
                ))}
              </div>
              {!visible.length && (
                <p className="empty-message">Ничего не найдено. Попробуйте другой запрос.</p>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
