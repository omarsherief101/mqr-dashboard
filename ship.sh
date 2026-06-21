#!/usr/bin/env bash
# ship.sh — push a dashboard change so it (a) reaches all teammates on GitHub
# and (b) goes live automatically.
#
# Usage:
#   ./ship.sh "short description of the change"
#
# How it works:
#   GitHub -> Vercel auto-deploy is connected (production branch = main).
#   So a push to main IS the deploy. This script just makes that one step safe:
#     1. Pulls latest from main   (never overwrite a teammate's work)
#     2. Commits ALL your changes
#     3. Pushes to GitHub         -> teammates synced + Vercel deploys live automatically
#
# No Vercel token or extra command needed — pushing is the deploy.

set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "❌ Please pass a change description:  ./ship.sh \"what you changed\""
  exit 1
fi

echo "→ Committing your changes…"
git add -A
if git diff --cached --quiet; then
  echo "  (no code changes to commit)"
else
  git commit -q -m "$MSG"
fi

echo "→ Syncing latest from GitHub (so nobody's work is overwritten)…"
git pull --rebase origin main

echo "→ Pushing to GitHub (teammates synced + live deploy starts automatically)…"
git push origin main

echo "✅ Pushed. Vercel is auto-deploying now → https://mqr-dashboard.vercel.app (live in ~1 min)."
