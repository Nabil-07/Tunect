#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_KEY="${SSH_KEY:-$HOME/Downloads/tunect-prod-key.pem}"
EC2_SSH="${EC2_HOST:-ubuntu@3.109.113.199}"
LOCAL_PORT="${TUNNEL_PORT:-15432}"
RDS_ENDPOINT="${RDS_ENDPOINT:-tunect-prod-db.chwci0oy029n.ap-south-1.rds.amazonaws.com:5432}"

[[ -f "$SSH_KEY" ]] || { echo "SSH key not found: $SSH_KEY"; exit 1; }
[[ -f .env.prod ]] || { echo "Missing .env.prod"; exit 1; }

cleanup() { [[ -n "${SSH_PID:-}" ]] && kill "$SSH_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "Opening SSH tunnel …"
ssh -i "$SSH_KEY" -o ExitOnForwardFailure=yes -N -L "${LOCAL_PORT}:${RDS_ENDPOINT}" "${EC2_SSH}" &
SSH_PID=$!
sleep 2

export DATABASE_URL="$(node -e "
const fs = require('fs');
const line = fs.readFileSync('.env.prod', 'utf8').split('\n').find((l) => /^DATABASE_URL=/.test(l.trim()));
let url = line.replace(/^DATABASE_URL=/, '').trim().replace(/^[\"']|[\"']$/g, '');
url = url.replace(/@[^/?]+/, '@127.0.0.1:${LOCAL_PORT}');
const u = new URL(url.replace(/^postgresql:/, 'http:'));
const p = new URLSearchParams(u.search);
['schema','connection_limit','pool_timeout','connect_timeout'].forEach((k) => p.delete(k));
if (!p.has('sslmode')) p.set('sslmode', 'require');
console.log('postgresql://' + u.username + ':' + u.password + '@127.0.0.1:${LOCAL_PORT}' + u.pathname + '?' + p.toString());
")"

node scripts/export-prod-all-tables-excel.js
