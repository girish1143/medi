#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Checking Node.js and npm"
node -v
npm -v

echo "==> Preparing environment files if absent"
if [ ! -f "$ROOT_DIR/backend/.env" ] && [ -f "$ROOT_DIR/backend/.env.example" ]; then
  cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
  echo "Created backend/.env from template. Replace placeholder secrets before running!"
fi

if [ ! -f "$ROOT_DIR/frontend/.env" ] && [ -f "$ROOT_DIR/frontend/.env.example" ]; then
  cp "$ROOT_DIR/frontend/.env.example" "$ROOT_DIR/frontend/.env"
  echo "Created frontend/.env from template."
fi

echo "==> Installing backend and frontend dependencies"
npm --prefix "$ROOT_DIR/backend" install
npm --prefix "$ROOT_DIR/frontend" install

echo "==> Validating and generating Prisma client"
npm --prefix "$ROOT_DIR/backend" run db:validate
npm --prefix "$ROOT_DIR/backend" run db:generate
npm --prefix "$ROOT_DIR/backend" run db:status

echo "==> Setup complete"
