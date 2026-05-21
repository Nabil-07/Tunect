#!/usr/bin/env bash
# Purge committed .env files from ALL git history, then re-add origin and force-push.
# Run from repo root. Requires: git-filter-repo (pip install git-filter-repo)
#
# WARNING: Rewrites history. All collaborators must re-clone or reset after force-push.
# Rotate every secret that was ever in a committed .env file.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Install git-filter-repo first:"
  echo "  pip3 install git-filter-repo"
  echo "  # or: brew install git-filter-repo"
  exit 1
fi

REMOTE="${1:-origin}"
REMOTE_URL="$(git remote get-url "$REMOTE" 2>/dev/null || true)"

echo "==> Stopping if you have uncommitted work you need (stash/commit first)"
git status --short

echo "==> Removing env files from entire git history..."
git filter-repo --force --invert-paths \
  --path .env.docker \
  --path Frontend/.env \
  --path Frontend/.env.preprod \
  --path Frontend/.env.prod \
  --path backend/.env \
  --path backend/.env.local \
  --path backend/.env.preprod \
  --path backend/.env.prod \
  --path backend/.env.test

if [[ -n "$REMOTE_URL" ]]; then
  echo "==> Re-adding remote $REMOTE -> $REMOTE_URL"
  git remote add "$REMOTE" "$REMOTE_URL"
fi

echo ""
echo "Done locally. Next steps:"
echo "  1. git push --force --all $REMOTE"
echo "  2. git push --force --tags $REMOTE"
echo "  3. Rotate ALL secrets that were ever in committed .env files"
echo "  4. Tell teammates to: git fetch --all && git reset --hard origin/main (or re-clone)"
