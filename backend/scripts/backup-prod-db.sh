#!/usr/bin/env bash
# Full logical backup of production Postgres (pg_dump).
#
# Run ON the prod EC2 server (already SSH'd in), from backend/:
#   ./scripts/backup-prod-db.sh
#
# Or from your Mac via tunnel:
#   npm run backup:prod:tunnel
#
# Reads DATABASE_URL from .env (server) or .env.prod (local tunnel).

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
if [[ -f .env.prod ]] && [[ "${USE_PROD_ENV:-}" == "1" ]]; then
  ENV_FILE=".env.prod"
elif [[ ! -f .env ]] && [[ -f .env.prod ]]; then
  ENV_FILE=".env.prod"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No $ENV_FILE found in $(pwd)"
  exit 1
fi

# Load DATABASE_URL only (avoid sourcing whole .env — may break on special chars)
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL not set in $ENV_FILE"
  exit 1
fi

# pg_dump/libpq: drop Prisma-only query params (schema, connection_limit, pool_timeout, connect_timeout)
strip_prisma_params() {
  local url="$1"
  if [[ "$url" != *"?"* ]]; then
    echo "${url}?sslmode=require"
    return
  fi
  local base="${url%%\?*}"
  local qs="${url#*\?}"
  local kept=""
  IFS='&' read -ra parts <<< "$qs"
  for p in "${parts[@]}"; do
    case "$p" in
      schema=*|connection_limit=*|pool_timeout=*|connect_timeout=*)
        continue
        ;;
      sslmode=*)
        kept="${kept:+$kept&}$p"
        ;;
      *)
        kept="${kept:+$kept&}$p"
        ;;
    esac
  done
  if [[ "$kept" != *sslmode=* ]]; then
    kept="${kept:+$kept&}sslmode=require"
  fi
  echo "${base}?${kept}"
}

DUMP_URL="$(strip_prisma_params "$DATABASE_URL")"
OUT_DIR="${OUT_DIR:-/tmp}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${OUT_DIR}/tunect_prod_${STAMP}.dump"

mkdir -p "$OUT_DIR"

echo "Dumping to ${OUT_FILE} …"
pg_dump "$DUMP_URL" --format=custom --no-owner --no-acl --file="$OUT_FILE"

ls -lh "$OUT_FILE"
echo "Done. Copy to your Mac:"
echo "  scp -i ~/Downloads/tunect-prod-key.pem ubuntu@3.109.113.199:${OUT_FILE} ~/Desktop/tunect-backups/"
