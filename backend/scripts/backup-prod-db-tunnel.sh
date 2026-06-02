#!/usr/bin/env bash
# Mac: SSH tunnel + pg_dump using .env.prod
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_KEY="${SSH_KEY:-$HOME/Downloads/tunect-prod-key.pem}"
EC2_SSH="${EC2_HOST:-ubuntu@3.109.113.199}"
LOCAL_PORT="${TUNNEL_PORT:-15432}"
RDS_ENDPOINT="${RDS_ENDPOINT:-tunect-prod-db.chwci0oy029n.ap-south-1.rds.amazonaws.com:5432}"
OUT_DIR="${OUT_DIR:-$HOME/Desktop/tunect-backups}"

[[ -f "$SSH_KEY" ]] || { echo "SSH key not found: $SSH_KEY"; exit 1; }
[[ -f .env.prod ]] || { echo "Missing .env.prod"; exit 1; }

cleanup() {
  [[ -n "${SSH_PID:-}" ]] && kill "$SSH_PID" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${OUT_DIR}/tunect_prod_${STAMP}.dump"

echo "Opening SSH tunnel …"
ssh -i "$SSH_KEY" -o ExitOnForwardFailure=yes -N -L "${LOCAL_PORT}:${RDS_ENDPOINT}" "${EC2_SSH}" &
SSH_PID=$!
sleep 2

TUNNEL_URL="$(node -e "
const fs = require('fs');
const line = fs.readFileSync('.env.prod', 'utf8').split('\n').find((l) => /^DATABASE_URL=/.test(l.trim()));
if (!line) process.exit(1);
let url = line.replace(/^DATABASE_URL=/, '').trim().replace(/^[\"']|[\"']$/g, '');
url = url.replace(/@[^/?]+/, '@127.0.0.1:${LOCAL_PORT}');
const u = new URL(url.replace(/^postgresql:/, 'http:'));
const params = new URLSearchParams(u.search);
['schema','connection_limit','pool_timeout','connect_timeout'].forEach((k) => params.delete(k));
if (!params.has('sslmode')) params.set('sslmode', 'require');
u.search = params.toString();
console.log('postgresql://' + u.username + ':' + u.password + '@' + u.hostname + ':' + u.port + u.pathname + (u.search ? '?' + params.toString() : ''));
")"

echo "Running pg_dump → ${OUT_FILE}"
pg_dump "$TUNNEL_URL" --format=custom --no-owner --no-acl --file="$OUT_FILE"
ls -lh "$OUT_FILE"
echo "Backup saved."
