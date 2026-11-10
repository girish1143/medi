#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required." >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/backend/.env" ]; then
  echo "Error: backend/.env is missing. Copy backend/.env.example and set cryptographically random secrets." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT_DIR/backend/.env"
set +a

required_vars=("DATABASE_URL" "JWT_ACCESS_SECRET" "JWT_REFRESH_SECRET" "FRONTEND_ORIGIN")
for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "Error: Required backend environment variable $var is unset or empty." >&2
    exit 1
  fi
done

if [ "${#JWT_ACCESS_SECRET}" -lt 32 ] || [ "${#JWT_REFRESH_SECRET}" -lt 32 ]; then
  echo "Error: JWT secrets must be at least 32 characters long." >&2
  exit 1
fi

echo "Environment verification passed."
