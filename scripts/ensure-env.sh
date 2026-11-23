#!/bin/bash
set -e

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

# Создаем .env из .env.example, если файла нет
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$EXAMPLE_FILE" ]; then
    cp "$EXAMPLE_FILE" "$ENV_FILE"
    echo "Created .env from .env.example"
  else
    touch "$ENV_FILE"
  fi
fi

# Список секретов, обязательных для запуска контейнеров
REQUIRED_KEYS=(
  "JWT_ACCESS_SECRET"
  "JWT_REFRESH_SECRET"
  "PICKUP_SECRET"
  "SEED_PASSWORD"
)

for KEY in "${REQUIRED_KEYS[@]}"; do
  # Проверяем, есть ли непустое значение для ключа
  if ! grep -qE "^${KEY}=.+" "$ENV_FILE" 2>/dev/null; then
    # Генерируем 32 байта случайной строки base64url через openssl
    VAL=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
    if grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
      sed -i "s|^${KEY}=.*|${KEY}=${VAL}|" "$ENV_FILE"
    else
      echo "${KEY}=${VAL}" >> "$ENV_FILE"
    fi
    echo "Generated secret for ${KEY}"
  fi
done

echo "Environment file ${ENV_FILE} is verified and ready."
