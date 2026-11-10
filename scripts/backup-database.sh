#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${BACKEND_DB_PATH:-$ROOT_DIR/backend/prisma/dev.db}"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/hospital-sqlite-$TIMESTAMP.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database file not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$DEST'"
else
  cp "$DB_PATH" "$DEST"
fi

echo "Backup written to $DEST"
