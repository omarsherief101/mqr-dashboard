#!/usr/bin/env bash
# ship.sh — push code to GitHub (so all teammates stay in sync) AND deploy live.
#
# Usage:
#   ./ship.sh "short description of the change"
#
# What it does:
#   1. Commits ALL current changes to main with your message.
#   2. Pushes to GitHub  -> teammates instantly see the updated code.
#   3. Deploys to Vercel -> the live dashboard updates.
#
# Requires VERCEL_TOKEN in env.local (already set up).

set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "❌ Please pass a change description:  ./ship.sh \"what you changed\""
  exit 1
fi

# Load the Vercel token from env.local (strip the KEY= and surrounding quotes)
if [ -f env.local ]; then
  VERCEL_TOKEN="$(grep -E '^VERCEL_TOKEN=' env.local | head -1 | cut -d= -f2- | tr -d '"'"'"'"' ')"
  export VERCEL_TOKEN
fi
if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "❌ VERCEL_TOKEN not found in env.local"
  exit 1
fi

echo "→ Syncing latest from GitHub (so nobody's work is overwritten)…"
git pull --rebase origin main

echo "→ Committing your changes…"
git add -A
if git diff --cached --quiet; then
  echo "  (no code changes to commit — will still redeploy current code)"
else
  git commit -q -m "$MSG"
fi

echo "→ Pushing to GitHub (teammates now see the update)…"
git push origin main

echo "→ Deploying to live dashboard…"
npx vercel --prod --yes --token="$VERCEL_TOKEN"

echo "✅ Done — teammates are synced and https://mqr-dashboard.vercel.app is updated."
