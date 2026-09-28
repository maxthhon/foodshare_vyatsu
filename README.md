# foodshare_vyatsu (MVP)

FoodShare — это двусторонняя программная платформа (B2C/B2B), предназначенная для оптимизации реализации непроданных остатков готовой продукции предприятий общественного питания (ресторанов, кафе, пекарен) конечному потребителю по сниженной стоимости в формате «сюрприз-боксов» и точечных позиций.

---

## 1. Архитектура и технологический стек

Проект реализован по сервисно-ориентированной архитектуре в формате монорепозитория (Monorepo) на базе единой экосистемы TypeScript.

### 1.1. Клиентская часть (Frontend)
* **Фреймворк:** React 18, TypeScript, Vite
* **Стилизация:** Tailwind CSS
* **Мобильная адаптация:** Progressive Web Application (PWA via `vite-plugin-pwa`)
* **Картография и геосервисы:** Yandex Maps JavaScript API / Leaflet
* **Веб-сервер для раздачи статики:** Nginx (Alpine-based container)

### 1.2. Серверная часть (Backend)
* **Платформа выполнения:** Node.js 20 LTS
* **Фреймворк:** Express.js, TypeScript
* **ORM и управление схемой:** Prisma ORM
* **Аутентификация и безопасность:** JSON Web Tokens (JWT), Bcrypt, Helmet, CORS

### 1.3. Базы данных и кэширование
* **Основная СУБД:** PostgreSQL 16 (хранение реляционных данных пользователей, заведений, номенклатуры и заказов)
* **Кэширование и очереди:** Redis 7 (управление временными блокировками и таймерами бронирования боксов)

### 1.4. Инфраструктура и DevOps
* **Контейнеризация:** Docker, Docker Compose
* **CI/CD:** GitHub Actions (статический анализ, линтинг, сборка образов, автотесты)
* **Хостинг:** Yandex Cloud (Compute Cloud, Managed Service for PostgreSQL) с соблюдением требований 152-ФЗ

---

## 2. Структура монорепозитория

```text
foodshare/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Конфигурация GitHub Actions CI/CD
├── client/                        # Исходный код клиентской части (React)
│   ├── public/
│   ├── src/
│   │   ├── api/                   # Модули интеграции с REST API
│   │   ├── components/            # Переиспользуемые UI-компоненты
│   │   ├── pages/                 # Страницы B2C-витрины и B2B-кабинета
│   │   ├── types/                 # TypeScript-интерфейсы
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf                 # Конфигурация Reverse Proxy и SPA-роутинга
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/                        # Исходный код серверной части (Express)
│   ├── prisma/
│   │   ├── schema.prisma          # Схема сущностей БД
│   │   └── seed.ts                # Скрипт генерации первичных тестовых данных
│   ├── src/
│   │   ├── controllers/           # Контроллеры обработки запросов
│   │   ├── middlewares/           # Промежуточное ПО (Auth, Error handler, Rate Limit)
│   │   ├── routes/                # Маршрутизация REST API
│   │   ├── services/              # Бизнес-логика платформы
│   │   └── index.ts               # Точка входа в приложение
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml             # Описание сервисов локального и production-окружения
├── .env.example                   # Шаблон конфигурационных переменных
├── .gitignore
└── README.md
