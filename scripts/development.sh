#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT_DIR/scripts/check-environment.sh"

cleanup() {
  echo ""
  echo "==> Shutting down development servers..."
  if [ -n "${BACKEND_PID:-}" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [ -n "${FRONTEND_PID:-}" ]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

echo "==> Starting Express backend dev server..."
npm --prefix "$ROOT_DIR/backend" run dev &
BACKEND_PID=$!

echo "==> Starting Next.js frontend dev server..."
npm --prefix "$ROOT_DIR/frontend" run dev &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
