#!/bin/bash
set -e

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

# 1. Если .env нет совсем, копируем из .env.example
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$EXAMPLE_FILE" ]; then
    cp "$EXAMPLE_FILE" "$ENV_FILE"
    echo "Created .env from .env.example"
  else
    touch "$ENV_FILE"
  fi
fi

# 2. Если в .env отсутствуют базовые переменные для базы данных, добавляем их
if ! grep -q "^POSTGRES_DB=" "$ENV_FILE" 2>/dev/null; then
  echo "POSTGRES_DB=foodshare" >> "$ENV_FILE"
  echo "Added POSTGRES_DB=foodshare"
fi
if ! grep -q "^POSTGRES_USER=" "$ENV_FILE" 2>/dev/null; then
  echo "POSTGRES_USER=foodshare" >> "$ENV_FILE"
  echo "Added POSTGRES_USER=foodshare"
fi
if ! grep -q "^POSTGRES_PASSWORD=" "$ENV_FILE" 2>/dev/null; then
  PASS=$(openssl rand -hex 12)
  echo "POSTGRES_PASSWORD=${PASS}" >> "$ENV_FILE"
  echo "Generated secure POSTGRES_PASSWORD"
fi

# 3. Список секретов, которые должны быть заполнены
REQUIRED_KEYS=(
  "JWT_ACCESS_SECRET"
  "JWT_REFRESH_SECRET"
  "PICKUP_SECRET"
  "SEED_PASSWORD"
)

for KEY in "${REQUIRED_KEYS[@]}"; do
  if ! grep -qE "^${KEY}=.+" "$ENV_FILE" 2>/dev/null; then
    VAL=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
    if grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
      sed -i "s|^${KEY}=.*|${KEY}=${VAL}|" "$ENV_FILE"
    else
      echo "${KEY}=${VAL}" >> "$ENV_FILE"
    fi
    echo "Generated secret for ${KEY}"
  fi
done

# 4. Копируем любые остальные недостающие переменные из .env.example
if [ -f "$EXAMPLE_FILE" ]; then
  while IFS='=' read -r key val || [ -n "$key" ]; do
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    key=$(echo "$key" | tr -d ' ')
    if [ -n "$key" ] && ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      echo "${key}=${val}" >> "$ENV_FILE"
      echo "Added missing default: ${key}"
    fi
  done < "$EXAMPLE_FILE"
fi

echo "Environment file ${ENV_FILE} is verified and ready."
