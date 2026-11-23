# FoodShare

Локальный MVP сервиса для бронирования и самовывоза еды в Кирове.

## Локальный запуск за 3 команды

Понадобятся Node.js 22.13 или новее и запущенный Docker Desktop с Linux-контейнерами либо Docker Engine с плагином Compose, поддерживающим `up --wait`. Выполняйте команды в корне проекта. Команды одинаковы для Windows PowerShell, macOS и Linux.

При первом запуске подготовьте локальный `.env`. Эта команда создаёт недостающие JWT-ключи, ключ выдачи и пароль демонстрационных аккаунтов. При повторном запуске скрипт сохраняет заполненные значения.

```sh
node scripts/init-local-env.mjs
```

Затем выполните по порядку, дожидаясь завершения каждой команды.

```sh
docker compose up --build -d --wait
docker compose exec server npm run db:migrate
docker compose exec server npm run db:seed
```

1. `up` собирает веб-клиент и API, запускает четыре контейнера и ждёт готовности зависимостей.
2. `db:migrate` применяет миграции Prisma к PostgreSQL.
3. `db:seed` загружает демонстрационные предложения и аккаунты Кирова.

После seed откройте [витрину FoodShare](http://127.0.0.1:8080) и проверьте [состояние API](http://127.0.0.1:8080/api/health). На новой базе витрина содержит 12 предложений, а API возвращает `{"status":"ok"}` при доступных PostgreSQL и Redis.

### Остановка и диагностика

- `docker compose ps` показывает состояние контейнеров, а `docker compose logs --tail 50 server` — последние сообщения API.
- Если Docker недоступен, запустите Docker Desktop или Docker Engine. Первый запуск скачивает базовые образы и зависимости.
- Если порт занят, поменяйте нужное значение в `.env`. По умолчанию используются `CLIENT_PORT=8080`, `SERVER_PORT=3000`, `POSTGRES_PORT=15432` и `REDIS_PORT=6379`. При смене порта клиента изменится адрес витрины. Для запуска Express или Vite вне Docker обновите связанные URL по инструкции ниже.
- Если на повторном запуске витрина пуста, проверьте доступность предложений и дату самовывоза. Seed сохраняет уже созданные слоты. Новый слот можно опубликовать из шаблона в кабинете заведения.
- `docker compose down` останавливает стенд с сохранением данных в именованных томах. Все опубликованные порты привязаны к `127.0.0.1`. Пароль PostgreSQL из шаблона рассчитан на локальный стенд.

## Разработка с Vite

Выполните миграции и seed по инструкции выше. Затем выполните `docker compose stop server client`, чтобы освободить порты для локальных процессов. PostgreSQL и Redis продолжат работать в Compose. Из корня проекта откройте два терминала.

| Терминал | Установка по lock-файлу | Запуск с перезагрузкой при изменениях |
| --- | --- | --- |
| API | `npm --prefix ./server ci` | `npm --prefix ./server run dev` |
| Клиент | `npm --prefix ./client ci` | `npm --prefix ./client run dev` |

Если PowerShell блокирует `npm.ps1`, используйте `npm.cmd` вместо `npm`. Vite работает на [127.0.0.1:5173](http://127.0.0.1:5173) и проксирует `/api` в Express. Если меняете порт API, обновите `SERVER_PORT` и `API_PROXY_TARGET`. Для локальных подключений к БД и Redis указывайте опубликованные порты в `DATABASE_URL` и `REDIS_URL`. Внутри Compose API получает отдельные URL с именами сервисов. При замене пароля PostgreSQL в локальном шаблоне используйте URL-безопасное значение и обновите его в `DATABASE_URL`.

## Тестовые аккаунты и API

Seed создаёт четыре вымышленных заведения со статусом `ACTIVE`, 12 предложений и аккаунты обеих ролей. Пароль всех демонстрационных аккаунтов берётся из `SEED_PASSWORD` в локальном `.env` при первом создании. Повторный запуск seed сохраняет уже созданные записи, их слоты и пароли.

| Роль | Email | Профиль |
| --- | --- | --- |
| Покупатель | `customer@foodshare.example` | Покупатель FoodShare |
| Заведение | `venue1@foodshare.example` | Кофейня «Тёплая чашка» |
| Заведение | `venue2@foodshare.example` | Пекарня «Вятская корочка» |
| Заведение | `venue3@foodshare.example` | Кафе «На Спасской» |
| Заведение | `venue4@foodshare.example` | Магазин «Запас на завтра» |

### Проверка в браузере

1. Войдите покупателем и добавьте «Чизкейк» из «Тёплой чашки» в корзину. В демонстрационном профиле указана лактоза, поэтому интерфейс предложит подтвердить добавление.
2. Забронируйте и выполните тестовую оплату. На карточке заказа появятся ПИН и QR. Для проверки возврата отмените оплаченный заказ до перевода в статус «Готов к выдаче».
3. Войдите в аккаунт заведения, которому принадлежит предложение. В кабинете откройте «Заказы», нажмите «Готов к выдаче» и подтвердите выдачу по ПИН. Для QR используйте камеру либо загрузите изображение кода. Выдача появится в разделе «Аналитика».
4. На узком экране проверьте вкладки «Главная», «Карта», «Заказы», «Избранное» и «Профиль» в нижнем меню. Для подложки карты нужен интернет. Адреса и предложения также доступны в списке заведений.

### Подключение Яндекс Карт

1. Создайте ключ **JavaScript API** в [Кабинете разработчика Яндекса](https://developer.tech.yandex.ru/). В ограничениях по HTTP Referer добавьте `localhost` для локального запуска и домен сайта для размещённой версии. [Быстрый старт Яндекс Карт](https://yandex.ru/maps-api/docs/js-api/common/quickstart.html)
2. Добавьте `VITE_YANDEX_MAPS_API_KEY=ваш_ключ` в корневой `.env`. Это браузерный ключ. Ограничение по Referer защищает его от использования с других сайтов.
3. Из корня проекта пересоберите клиент командой `docker compose up -d --build --no-deps client` и откройте [карту](http://localhost:8080/map). При запуске через Vite перезапустите dev-сервер и откройте [карту на порту 5173](http://localhost:5173/map).

Без ключа и при ошибке запуска Яндекс Карт используется Leaflet с OpenStreetMap. Геопоиск и список заведений получают данные из API FoodShare при любой подложке.

Камера и определение местоположения зависят от разрешений браузера. В Docker-сборке PWA сохраняет оболочку интерфейса и локальные изображения. Актуальные предложения и операции с заказами запрашиваются через API.

Иллюстрации в `client/public/food/` сгенерированы встроенным ImageGen. Для обложки запросили журнальную фотографию крафтовой коробки с круассаном, хлебом и сэндвичем на зелёной ткани в боковом солнечном свете, без текста и логотипов. Для карточек запросили четыре фотографии без текста в сетке 2 × 2: выпечка, готовый обед, чизкейк и фрукты. Они иллюстрируют категории, состав сюрприз-бокса зависит от заведения.

- `POST /api/auth/register` принимает `name`, `email`, `password` и `role`. Для `ESTABLISHMENT` можно передать `establishmentName`. Новый профиль заведения получает `PENDING`.
- `POST /api/auth/login` принимает `email` и `password`. Ответ содержит `user` и `accessToken`. Refresh-токен передаётся в `HttpOnly` cookie.
- `POST /api/auth/refresh` заменяет refresh-токен из cookie новым. `POST /api/auth/logout` завершает сессию и очищает cookie. Access-токен действует до 15 минут, сессия — до семи дней от входа или регистрации.
- `GET /api/me` и `GET /api/establishments/me` принимают `Authorization: Bearer <accessToken>`. Маршрут заведения доступен только владельцу собственного профиля.

Проверка входа в Windows PowerShell из корня проекта

```powershell
$seedPassword = node --env-file=.env -p "process.env.SEED_PASSWORD"
$loginBody = @{ email = 'customer@foodshare.example'; password = $seedPassword } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8080/api/auth/login' -ContentType 'application/json' -Body $loginBody
$login.user
```

Вывод покажет только профиль покупателя с ролью `CUSTOMER`.

## Каталог и заказы

| API | Поведение |
| --- | --- |
| `GET /api/boxes` | Гостевой каталог с параметрами `q`, `type`, `category`, `establishmentCategory`, `establishmentId`, `minPrice`, `maxPrice`, `excludeAllergens` (через запятую), `lat`, `lng`, `radiusKm`. Цены в копейках. Радиус по умолчанию при переданных координатах — 10 км. |
| `GET /api/boxes/:id`, `GET /api/allergens` | Карточка и справочник аллергенов. При передаче access-токена покупателя карточка и каталог показывают совпадения с профилем в `containsUserAllergens`. |
| `GET /api/establishments`, `GET /api/establishments/map`, `GET /api/establishments/:id` | Список для фильтра, точки с доступными предложениями и публичный профиль. Карта принимает фильтры каталога или границы `north`, `south`, `west`, `east`. |
| `POST /api/orders` | Тело `{ "items": [{ "offerId": "...", "quantity": 1 }] }` и заголовок `Idempotency-Key`. Все позиции принадлежат одному заведению, а их общее окно покрывает срок брони. `RESERVATION_TTL_MINUTES` по умолчанию 15, `PLATFORM_COMMISSION_PERCENT` — 18%. |
| `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/cancel` | История, детали и отмена своего заказа. В статусах `PAID` и `READY` детали содержат `pickup.pin` и `pickup.qrToken`. Самостоятельная отмена действует для `RESERVED` и `PAID`. Для оплаченного заказа мок фиксирует возврат. |
| `POST /api/orders/:id/payments`, `GET /api/orders/:id/payments` | Мок принимает `{ "outcome": "success" }` или `{ "outcome": "failure" }` и отдельный `Idempotency-Key` на попытку. История показывает статус оплаты и возврата. |
| `GET /api/establishments/me/orders`, `POST /api/establishments/me/orders/:id/ready`, `POST /api/establishments/me/orders/:id/confirm` | Заведение видит свои заказы, ставит `READY` и выдаёт заказ по `{ "pin": "0123" }` либо `{ "qrToken": "..." }`. PIN уникален среди активных заказов заведения, QR использует отдельный токен. |
| `PUT /api/establishments/me`, `/api/establishments/me/boxes`, `/api/establishments/me/templates` | Настройки заведения, управление предложениями и шаблонами. Для публикации из шаблона передайте `templateId`, `quantity`, `pickupStartsAt` и `pickupEndsAt` в ISO 8601. `DELETE` предложения архивирует его. |
| `GET /api/establishments/me/analytics` | Проданные позиции и боксы, валовая выручка, комиссия, чистая выручка и непроданные остатки по дням Кирова. `from` и `to` принимают даты `YYYY-MM-DD` включительно. По умолчанию показываются последние семь дней. Продажи считаются по выданным заказам, непроданные остатки — на закрытых слотах. |
| `PATCH /api/me`, `/api/favorites`, `/api/reviews`, `GET /api/me/impact` | Имя и `allergenIds`, доступное избранное, отзывы по выданным заказам и эко-вклад. Оценка CO₂ считается по настраиваемому `CO2_KG_PER_KG`, по умолчанию 2.5 кг CO₂ на кг спасённой еды. |

Массивы возвращаются с `page`, `limit` и `hasMore` в объектах пагинации. Каталог и карта показывают предложения со статусом заведения `ACTIVE`, положительным остатком и действующим окном самовывоза. Redis хранит TTL брони. Фоновая обработка использует срок из PostgreSQL для восстановления при пропущенном Redis-таймере. Уведомления-заглушки записывают тип события после оплаты, готовности к выдаче и истечения брони.

Для проверки брони в PowerShell выполните вход покупателем из предыдущего раздела, затем используйте полученный `$login`:

```powershell
$api = 'http://127.0.0.1:8080/api'
$offer = (Invoke-RestMethod -Uri "$api/boxes").items | Select-Object -First 1
$headers = @{ Authorization = "Bearer $($login.accessToken)"; 'Idempotency-Key' = [guid]::NewGuid().ToString() }
$body = @{ items = @(@{ offerId = $offer.id; quantity = 1 }) } | ConvertTo-Json -Depth 3
$order = Invoke-RestMethod -Method Post -Uri "$api/orders" -Headers $headers -ContentType 'application/json' -Body $body
$order | Select-Object id, status, expiresAt, totalAmount, commissionAmount
Invoke-RestMethod -Method Post -Uri "$api/orders/$($order.id)/cancel" -Headers $headers | Select-Object id, status
```

Ожидаемые статусы — `RESERVED` и `CANCELLED`. После отмены остаток возвращается в витрину, пока действует слот. Если витрина пуста, сначала опубликуйте предложение с актуальным слотом через API заведения.
