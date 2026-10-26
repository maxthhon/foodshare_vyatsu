# 🌿 FoodShare Vyatsu — Контекст проекта и руководство (в т.ч. для ИИ-агентов)

Документ содержит концентрированную информацию об архитектуре, стеке, портах, правилах разработки и окружении проекта для разработчиков и ИИ-ассистентов (AI Coding Agents).

---

## 1. О проекте (Executive Summary)
- **Название:** FoodShare (ВятГУ).
- **Миссия:** B2B2C MVP-платформа фудшеринга в г. Кирове. Позволяет заведениям (кафе, пекарням) выставлять нераспроданные свежие блюда/выпечку с дисконтом до 70%, а студентам и жителям — бронировать их через приложение.
- **Основные сущности:** Пользователь (`User`), Заведение (`Restaurant`), Сюрприз-бокс/набор (`Box`), Бронь/Заказ (`Order`).

---

## 2. Стек технологий

| Слой | Технологии |
| :--- | :--- |
| **Frontend (`client/`)** | React 18, TypeScript, Vite 5, Tailwind CSS, Lucide React, Nginx (Alpine) |
| **Backend (`server/`)** | Node.js 20, Express, TypeScript, Prisma ORM 5, Helmet, CORS, Dotenv |
| **База данных** | PostgreSQL 16 (доступ через Prisma ORM) |
| **Кэш / Сессии** | Redis 7 Alpine |
| **Оркестрация** | Docker Compose (4 сервиса: `postgres`, `redis`, `server`, `client`) |
| **CI/CD** | GitHub Actions (`.github/workflows/ci.yml`) |

---

## 3. Сеть и порты (Network & Ports)

> ⚠️ **Критично для macOS:** Порт `5000` на хосте macOS занят службой *AirPlay Receiver*. Поэтому внешний порт API бэкенда назначен на `5001`.

| Сервис | Контейнер | Внутренний порт | Хост-порт | URL |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | `foodshare_frontend` | `80` (Nginx) | `80` | [http://localhost](http://localhost) |
| **Backend API** | `foodshare_backend` | `5000` | `5001` | [http://localhost:5001/api](http://localhost:5001/api) |
| **Vite Dev** (локально) | — | — | `5173` | [http://localhost:5173](http://localhost:5173) |
| **PostgreSQL** | `foodshare_db` | `5432` | `5432` | `localhost:5432` |
| **Redis** | `foodshare_redis` | `6379` | `6379` | `localhost:6379` |

**Nginx Reverse-Proxy:**  
В Docker все клиентские запросы к `/api/` проксируются внутри сети на `http://server:5000/api/`.

---

## 4. Структура репозитория

```text
foodshare_vyatsu/
├── client/                     # Фронтенд (React + Vite)
│   ├── src/
│   │   ├── App.tsx             # Главный компонент
│   │   ├── main.tsx            # Точка входа React
│   │   └── index.css           # Tailwind CSS
│   ├── Dockerfile              # Multi-stage сборка (Node -> Nginx)
│   └── nginx.conf              # SPA маршрутизация + прокси /api/
├── server/                     # Бэкенд (Express API)
│   ├── prisma/
│   │   ├── schema.prisma       # Схема БД (PostgreSQL)
│   │   └── seed.ts             # Тестовые данные
│   ├── src/
│   │   └── index.ts            # Сервер Express (/api/health)
│   └── Dockerfile              # Node.js 20 runner
├── scripts/
│   └── install-extensions.js   # Умный скрипт первичной настройки проекта
├── .vscode/                    # Настройки VS Code (extensions, settings, tasks, launch)
├── .dockerignore               # Исключение node_modules из сборки образов
├── .editorconfig               # Единый стиль отступов и LF
├── .gitattributes              # Принудительная нормализация eol=lf
├── .prettierrc                 # Настройки Prettier
├── docker-compose.yml          # Локальная инфраструктура
└── package.json                # Корневые команды управления
```

---

## 5. Основные команды (CLI Cheatsheet)

```bash
# Первичная настройка окружения (создаст .env, проверит расширения и npm):
node scripts/install-extensions.js

# Запуск всей системы в Docker:
docker compose up -d --build

# Остановка:
docker compose stop     # пауза
docker compose down     # остановка и удаление контейнеров

# Локальная разработка без Docker (с Hot-Reload):
docker compose up -d postgres redis   # запустить только базы
npm run dev:server                    # в терминале 1
npm run dev:client                    # в терминале 2 (http://localhost:5173)

# Команды Prisma (БД):
npx --prefix server prisma generate   # генерация типов Prisma Client
npx --prefix server prisma db push     # применить схему к БД
npx --prefix server prisma db seed     # наполнить сидами
npx --prefix server prisma studio      # графическая админка БД
```

---

## 6. Контекст и правила для ИИ-агентов (AI Agent Guidelines)

Если вы работаете над проектом как AI-ассистент (Antigravity, Cursor, Copilot, Claude):

1. **Кроссплатформенность и окончания строк:**
   - Всегда используйте окончания строк `\n` (`LF`). Никогда не генерируйте `CRLF`.
   - Не завязывайтесь на специфичные оболочки; команды должны работать на Windows (PowerShell/cmd), Linux и macOS.
2. **TypeScript & Сборка:**
   - В `client/tsconfig.json` включены `noUnusedLocals: true` и `allowImportingTsExtensions: false`.
   - Не импортируйте файлы с явным расширением `.tsx` (пишите `import App from './App'`).
   - Не оставляйте неиспользуемые импорты (например, `import React from 'react'`).
   - Перед отправкой проверяйте сборку: `npm run build` в `client/` и `server/`.
3. **Docker-контекст:**
   - Локальные папки `node_modules` исключены через `.dockerignore`.
   - При изменении серверного API или зависимостей внутри Docker требуется пересборка: `docker compose up -d --build`.
   - Хостовый порт сервера — **`5001`**, не меняйте его обратно на `5000` во избежание краша на macOS.
4. **Стиль кода и форматирование:**
   - Используйте Prettier: одинарные кавычки (`singleQuote: true`), точка с запятой (`semi: true`), отступ 2 пробела, ширина строки 100.
