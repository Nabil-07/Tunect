#!/usr/bin/env bash
# Export prod finance Excel via SSH tunnel through the EC2 app server.
# RDS is not public; the Lightsail/EC2 host can reach it.
#
# Prerequisites:
#   chmod 400 ~/Downloads/tunect-prod-key.pem
#   backend/.env.prod with DATABASE_URL pointing at RDS
#
# Usage:
#   ./scripts/export-prod-finance-tunnel.sh
#   SSH_KEY=~/.ssh/my.pem EC2_HOST=ubuntu@3.109.113.199 ./scripts/export-prod-finance-tunnel.sh

set -euo pipefail
cd "$(dirname "$0")/.."

SSH_KEY="${SSH_KEY:-$HOME/Downloads/tunect-prod-key.pem}"
EC2_SSH="${EC2_HOST:-ubuntu@3.109.113.199}"
LOCAL_PORT="${TUNNEL_PORT:-15432}"
RDS_ENDPOINT="${RDS_ENDPOINT:-tunect-prod-db.chwci0oy029n.ap-south-1.rds.amazonaws.com:5432}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY"
  echo "Set SSH_KEY=path/to/tunect-prod-key.pem"
  exit 1
fi

if [[ ! -f .env.prod ]]; then
  echo "Missing backend/.env.prod"
  exit 1
fi

cleanup() {
  if [[ -n "${SSH_PID:-}" ]] && kill -0 "$SSH_PID" 2>/dev/null; then
    kill "$SSH_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Opening SSH tunnel localhost:${LOCAL_PORT} -> ${RDS_ENDPOINT} via ${EC2_SSH} …"
ssh -i "$SSH_KEY" -o ExitOnForwardFailure=yes -N -L "${LOCAL_PORT}:${RDS_ENDPOINT}" "${EC2_SSH}" &
SSH_PID=$!
sleep 2

if ! kill -0 "$SSH_PID" 2>/dev/null; then
  echo "SSH tunnel failed. Check key, EC2_HOST, and security groups."
  exit 1
fi

# Rewrite RDS host in .env.prod URL to localhost tunnel port (credentials unchanged).
TUNNEL_DATABASE_URL="$(node -e "
const fs = require('fs');
const line = fs.readFileSync('.env.prod', 'utf8')
  .split('\n')
  .find((l) => /^DATABASE_URL=/.test(l.trim()));
if (!line) { console.error('DATABASE_URL not in .env.prod'); process.exit(1); }
let url = line.replace(/^DATABASE_URL=/, '').trim().replace(/^[\"']|[\"']$/g, '');
url = url.replace(/@[^/?]+/, '@127.0.0.1:${LOCAL_PORT}');
console.log(url);
")"

export DATABASE_URL="$TUNNEL_DATABASE_URL"
echo "Tunnel up. Running export (host: 127.0.0.1:${LOCAL_PORT}) …"
npm run export:finance:env
