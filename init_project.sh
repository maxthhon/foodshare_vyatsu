#!/usr/bin/env zsh

set -e

PROJECT_NAME="foodshare"

echo "==> Инициализация проекта $PROJECT_NAME..."

# 1. Создание структуры директорий
mkdir -p "$PROJECT_NAME"
cd "$PROJECT_NAME"

mkdir -p .github/workflows
mkdir -p client/public client/src/api client/src/components client/src/pages client/src/types
mkdir -p server/prisma server/src/controllers server/src/middlewares server/src/routes server/src/services

# 2. Корневой .gitignore
cat << 'EOF' > .gitignore
node_modules/
dist/
build/
.env
.env.local
.DS_Store
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
EOF

# 3. Корневой .env.example
cat << 'EOF' > .env.example
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://foodshare_user:secretpassword@localhost:5432/foodshare_db?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
EOF

# 4. Корневой docker-compose.yml
cat << 'EOF' > docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: foodshare_db
    restart: always
    environment:
      POSTGRES_USER: foodshare_user
      POSTGRES_PASSWORD: secretpassword
      POSTGRES_DB: foodshare_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: foodshare_redis
    restart: always
    ports:
      - "6379:6379"

  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: foodshare_backend
    restart: always
    ports:
      - "5000:5000"
    environment:
      PORT: 5000
      NODE_ENV: production
      DATABASE_URL: "postgresql://foodshare_user:secretpassword@postgres:5432/foodshare_db?schema=public"
      REDIS_URL: "redis://redis:6379"
      JWT_SECRET: "super-secret-jwt-key-change-in-production"
    depends_on:
      - postgres
      - redis

  client:
    build:
      context: ./client
      dockerfile: Dockerfile
    container_name: foodshare_frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - server

volumes:
  pgdata:
EOF

# 5. CI/CD workflow (.github/workflows/ci.yml)
cat << 'EOF' > .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: |
            server/package.json
            client/package.json

      - name: Test Server Build
        run: |
          cd server
          npm ci
          npx prisma generate
          npm run build

      - name: Test Client Build
        run: |
          cd client
          npm ci
          npm run build
EOF

# ==============================================================================
# НАСТРОЙКА BACKEND (SERVER)
# ==============================================================================
echo "==> Настройка директории server/..."

cat << 'EOF' > server/package.json
{
  "name": "foodshare-server",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.19.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.9",
    "prisma": "^5.19.0",
    "tsx": "^4.15.7",
    "typescript": "^5.5.2"
  }
}
EOF

cat << 'EOF' > server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
EOF

cat << 'EOF' > server/prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  role      String   @default("BUYER")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  orders    Order[]
}

model Restaurant {
  id        String   @id @default(uuid())
  name      String
  address   String
  lat       Float
  lng       Float
  createdAt DateTime @default(now())
  boxes     Box[]
}

model Box {
  id            String     @id @default(uuid())
  title         String
  price         Float
  discountPrice Float
  restaurantId  String
  restaurant    Restaurant @relation(fields: [restaurantId], references: [id])
  orders        Order[]
}

model Order {
  id        String   @id @default(uuid())
  userId    String
  boxId     String
  pinCode   String
  status    String   @default("RESERVED")
  user      User     @relation(fields: [userId], references: [id])
  box       Box      @relation(fields: [boxId], references: [id])
  createdAt DateTime @default(now())
}
EOF

cat << 'EOF' > server/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Начало заполнения базы тестовыми данными...');
  
  await prisma.restaurant.create({
    data: {
      name: 'Пекарня «Хлебная лавка»',
      address: 'ул. Тверская, д. 12',
      lat: 55.7558,
      lng: 37.6173,
      boxes: {
        create: [
          {
            title: 'Свежая выпечка и круассаны (Box M)',
            price: 600,
            discountPrice: 200,
          }
        ]
      }
    }
  });

  console.log('База данных успешно наполнена первичными данными.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF

cat << 'EOF' > server/src/index.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'FoodShare API is operational' });
});

app.listen(PORT, () => {
  console.log(`[FoodShare Server] running on http://localhost:${PORT}`);
});
EOF

cat << 'EOF' > server/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist

EXPOSE 5000
CMD ["node", "dist/index.js"]
EOF

# Копируем .env для локальной разработки сервера
cp .env.example server/.env

# ==============================================================================
# НАСТРОЙКА FRONTEND (CLIENT)
# ==============================================================================
echo "==> Настройка директории client/..."

cat << 'EOF' > client/package.json
{
  "name": "foodshare-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.395.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.2",
    "vite": "^5.3.1"
  }
}
EOF

cat << 'EOF' > client/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
EOF

cat << 'EOF' > client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
});
EOF

cat << 'EOF' > client/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

cat << 'EOF' > client/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

cat << 'EOF' > client/index.html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FoodShare — Сервис спасения еды</title>
  </head>
  <body class="bg-gray-50 text-gray-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

cat << 'EOF' > client/src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF

cat << 'EOF' > client/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
EOF

cat << 'EOF' > client/src/App.tsx
import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">FoodShare Platform</h1>
        <p className="text-gray-600 mb-6 text-sm">
          MVP клиентского приложения по спасению готовой еды из ресторанов и пекарен со скидкой до 70%.
        </p>
        <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg text-sm font-medium">
          Frontend & Environment настроены успешно
        </div>
      </div>
    </div>
  );
}
EOF

cat << 'EOF' > client/nginx.conf
server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://server:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

cat << 'EOF' > client/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF

# ==============================================================================
# ИНИЦИАЛИЗАЦИЯ GIT
# ==============================================================================
echo "==> Инициализация Git-репозитория и создание веток..."

git init -b main
git add .
git commit -m "chore: initial project structure, docker, client and server setup"
git checkout -b develop

echo "==> Готово! Проект $PROJECT_NAME полностью сформирован."
echo ""
echo "Быстрый старт:"
echo "  cd $PROJECT_NAME"
echo "  docker compose up --build -d"
echo ""
echo "Для локальной разработки:"
echo "  docker compose up -d postgres redis"
echo "  (в server/): npm install && npm run dev"
echo "  (в client/): npm install && npm run dev"
