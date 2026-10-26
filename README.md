# 🌿 FoodShare Vyatsu

> Сервис фудшеринга: спасение готовой еды и выпечки из местных заведений со скидками до 70%.

---

## 🚀 Быстрый старт (Docker)

Для запуска всего проекта одной командой (БД, Redis, API и Фронтенд):

```bash
docker compose up -d --build
```

### Адреса локальных сервисов:
- **Фронтенд (React + Vite):** [http://localhost](http://localhost)
- **Бэкенд API (Express):** [http://localhost:5001/api](http://localhost:5001/api)
- **Health Check API:** [http://localhost:5001/api/health](http://localhost:5001/api/health)
- **База данных PostgreSQL:** `localhost:5432` (`foodshare_db`)
- **Redis:** `localhost:6379`

Остановить контейнеры:
```bash
docker compose stop    # временная пауза
docker compose down    # полная остановка
```

---

## 💻 Настройка для разработки в VS Code

1. Откройте папку проекта в VS Code: **File → Open Folder...** (или `Open...` на macOS).
2. В терминале выполните единую команду настройки:
   ```bash
   node scripts/install-extensions.js
   ```
   *Скрипт автоматически создаст `.env`, установит нужные расширения (Prettier, Tailwind, Prisma) и все зависимости `npm`.*
3. При сохранении любого файла (`Ctrl+S` / `Cmd+S`) Prettier автоматически выравнивает код под единый стиль и ставит правильные переносы строк (`LF`) для Windows, Linux и macOS.

---

## 🛠️ Локальный запуск без Docker

Если вы хотите запускать клиент и сервер на хосте (с Hot-Reload):

1. **Поднимите базу данных и Redis в Docker:**
   ```bash
   docker compose up -d postgres redis
   ```
2. **Запустите бэкенд:**
   ```bash
   npm run dev:server
   ```
3. **Запустите фронтенд** (в отдельном терминале):
   ```bash
   npm run dev:client
   ```
   *Фронтенд откроется на [http://localhost:5173](http://localhost:5173).*

---

## 🗄️ База данных (Prisma ORM)

Все команды выполняются из корня или папки `server/`:

```bash
# Применить изменения схемы schema.prisma к БД
npx --prefix server prisma db push

# Создать миграцию
npx --prefix server prisma migrate dev --name <название>

# Наполнить базу тестовыми данными
npx --prefix server prisma db seed

# Открыть веб-панель управления БД
npx --prefix server prisma studio
```

---

## 📁 Структура проекта

```text
foodshare_vyatsu/
├── client/                     # Frontend (React 18, Vite, Tailwind CSS)
│   └── src/                    # Компоненты, страницы и API-клиент
├── server/                     # Backend (Express, TypeScript, Prisma ORM)
│   ├── prisma/                 # Схема БД (schema.prisma) и сиды
│   └── src/                    # Контроллеры, роуты и сервисы
├── scripts/                    # Скрипты автоматизации для команды
├── .vscode/                    # Командные настройки редактора и расширений
└── docker-compose.yml          # Конфигурация локальной инфраструктуры
```

---

## 🌿 Правила работы с Git

1. Ветки создаются от `develop`:
   ```bash
   git switch -c feature/название-фичи
   ```
2. Форматирование кода перед коммитом:
   ```bash
   npm run format
   ```
3. Создавайте Pull Request из вашей ветки в `develop`.
