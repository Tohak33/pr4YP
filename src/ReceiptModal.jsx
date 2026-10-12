export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;
  return (
    <div className="modal-backdrop">
      <div
        className="receipt-card"
        role="dialog"
        aria-modal="true"
        aria-label="Подтверждение заказа"
      >
        <h2>Заказ оформлен</h2>
        <p>
          Номер заказа: <strong>{receipt.order_number}</strong>
        </p>
        <p>Статус: {receipt.status}</p>
        <p>
          Доставка: {new Date(`${receipt.delivery_date}T00:00:00`).toLocaleDateString('ru-RU')},{' '}
          {receipt.delivery_address}
        </p>
        <hr />
        <div className="receipt-items-list">
          {receipt.items.map((item) => (
            <div className="receipt-item-row" key={item.code}>
              <span>
                {item.name} × {item.quantity}
              </span>
              <strong>{(item.price * item.quantity).toLocaleString('ru-RU')} ₽</strong>
            </div>
          ))}
        </div>
        <hr />
        <div className="total-line">
          <span>Товары без скидок</span>
          <span>{receipt.total_initial.toLocaleString('ru-RU')} ₽</span>
        </div>
        {receipt.total_initial > receipt.total_with_product_discounts && (
          <div className="total-line discount-line">
            <span>Скидка на товары</span>
            <span>
              −
              {(receipt.total_initial - receipt.total_with_product_discounts).toLocaleString(
                'ru-RU'
              )}{' '}
              ₽
            </span>
          </div>
        )}
        {receipt.personal_discount > 0 && (
          <div className="total-line discount-line">
            <span>Скидка на первый заказ ({receipt.personal_discount}%)</span>
            <span>−{receipt.personal_discount_amount.toLocaleString('ru-RU')} ₽</span>
          </div>
        )}
        {receipt.coupon_code && (
          <div className="total-line discount-line">
            <span>Купон {receipt.coupon_code} ({receipt.coupon_discount_percent}%)</span>
            <span>−{receipt.coupon_discount_amount.toLocaleString('ru-RU')} ₽</span>
          </div>
        )}
        <div className="total-line final-line">
          <span>Одна общая сумма</span>
          <strong>{receipt.final_amount.toLocaleString('ru-RU')} ₽</strong>
        </div>
        <button className="btn-close-receipt" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
