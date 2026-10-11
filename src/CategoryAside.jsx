export default function CategoryAside({ categories, selected, onSelect }) {
  return <aside className="catalog-aside"><h3>Категории</h3><button className={selected === '' ? 'filter-active' : ''} onClick={() => onSelect('')}>Все товары</button>
    {categories.map(category => <button className={selected === category.name ? 'filter-active' : ''} key={category.name} onClick={() => onSelect(category.name)}>{category.name}</button>)}
  </aside>;
}
