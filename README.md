# Мебельный магазин

Информационная система продажи мебели на React, Express и PostgreSQL. Название проекта также указано в комментариях к основным модулям.

## Запуск

Требуются Node.js и PostgreSQL. Сервер использует существующий файл `backend/.env` и указанную в нём базу `phone_shop`. Схема и начальные товары уже находятся в этой базе.

```powershell
cd backend
npm install
npm start
```

Сервер запускается на порту 5000 и проверяет подключение к существующей базе. Электронные товары прежнего проекта не выводятся в мебельном каталоге.

В другом терминале:

```powershell
npm install
npm run dev
```

Клиент: `http://localhost:5173`. Адрес API по умолчанию `http://localhost:5000/api`; для другого адреса задайте `VITE_API_URL`.

Фотографии каталога взяты с Unsplash: [серый диван](https://unsplash.com/photos/gray-sofa-with-decorative-pillows-and-artwork-j99pROdLExs), [угловой диван](https://unsplash.com/photos/a-modern-gray-sectional-sofa-in-a-minimalist-room-MRx-rSdOKtk), [мягкая кровать](https://unsplash.com/photos/modern-bed-with-rounded-headboard-and-white-linens-2oChNpMfh_k), [деревянная кровать](https://unsplash.com/photos/white-bed-pillow-on-brown-wooden-bed-frame-gVKmonDbotU), [обеденный стол](https://unsplash.com/photos/empty-brown-wooden-dining-table-set-sGFV8EPd3Lk), [компьютерный стол](https://unsplash.com/photos/a-wooden-desk-topped-with-a-computer-monitor-and-keyboard-QNch8putqnU), [деревянный стул](https://unsplash.com/photos/a-wooden-chair-stands-against-a-white-background-ZCarpyNlYPQ), [серое кресло](https://unsplash.com/photos/gray-armchair-with-brown-wooden-frame-on-beige-area-rug-E5VqdtxLLMs), [шкаф](https://unsplash.com/photos/a-bedroom-with-a-bed-and-a-wooden-closet-6Y3avYzs6os), [комод](https://unsplash.com/photos/wooden-dresser-with-a-sign-and-electrical-outlets-5pWpz5IUwUo).

## Проверка ролей

Новые учётные записи получают роль `customer`. Для учебной проверки администратора зарегистрируйте отдельную учётную запись, затем назначьте роль в PostgreSQL:

```sql
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE email = 'admin@example.com';
```

Выйдите и войдите снова. В панели администратора доступны товары, категории, заказы и отзывы. Изменение и удаление пользователей или чеков не предусмотрено.

## Восстановление пароля

Для отправки письма укажите `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` и `SMTP_PASSWORD` в `backend/.env`. `SMTP_FROM` необязателен: по умолчанию отправителем будет `SMTP_USER`. Без SMTP форма сообщает, что отправка не настроена. Каждый запрос создаёт новый шестизначный код на 10 минут; в БД хранится только его хэш.

## Правила заказа

- Корзина и сессии хранятся в PostgreSQL. После выхода товары остаются у того же пользователя.
- В одном заказе не более 10 единиц; на выбранную дату суммарно по всем категориям доступно 10 единиц.
- Дата доставки проверяется на клиенте и сервере. Товар с нулевой ценой заказать нельзя.
- Весь заказ получает один номер и одну итоговую сумму. Заказ сначала имеет статус «Ожидает оплаты». Администратор может перевести его в «Оплачено», затем в доставку и завершение; вернуть оплаченный заказ к ожиданию оплаты нельзя.
- Скидка 5% применяется автоматически только к первому заказу пользователя.
- Покупатель может оставить один отзыв на товар после оплаты заказа с этим товаром; пустые отзывы и распространённая ненормативная лексика отклоняются. Старые отзывы без подтверждённой оплаты не показываются покупателям. После модерации отзыв остаётся с пометкой об удалении за нарушение политики.
- Администратор может создавать и переименовывать категории. Удаление категории переносит её товары в «Без категории».
- Корзина, отзывы и список заказов мебельного магазина показывают только мебель; старые заказы электроники остаются в базе, но не участвуют в расчёте скидки и дневного лимита.

## Проверка проекта

```powershell
npm run lint
npm run build
```

Фронтенд использует названия категорий, коды товаров и номера заказов; связи между таблицами строит сервер через SQL JOIN. Сервер проверяет сессию и роль на каждом защищённом маршруте.
