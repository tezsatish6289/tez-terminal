#!/usr/bin/env bash
# Grant App Hosting access to all secrets in apphosting.yaml, then create a rollout.
#
# Prerequisites:
#   firebase login --reauth
#   Secrets already created in GCP Secret Manager (Part B)
#
# Usage:
#   ./scripts/setup-apphosting-secrets-access.sh
#   APPHOSTING_BACKEND=my-backend ./scripts/setup-apphosting-secrets-access.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="${FIREBASE_PROJECT:-studio-6235588950-a15f2}"
LOCATION="${APPHOSTING_LOCATION:-asia-southeast1}"
BRANCH="${APPHOSTING_BRANCH:-main}"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Install Firebase CLI: npm install -g firebase-tools"
  exit 1
fi

echo "→ Project: $PROJECT"
firebase use "$PROJECT" >/dev/null

SECRETS="$(
  grep -E '^\s+secret:' apphosting.yaml \
    | sed 's/.*secret:[[:space:]]*//' \
    | paste -sd, -
)"

if [ -z "$SECRETS" ]; then
  echo "No secrets found in apphosting.yaml"
  exit 1
fi

BACKEND="${APPHOSTING_BACKEND:-}"
if [ -z "$BACKEND" ]; then
  echo "→ Listing App Hosting backends…"
  BACKEND="$(
    firebase apphosting:backends:list --project "$PROJECT" --json 2>/dev/null \
      | node -e "
        const fs = require('fs');
        let raw = '';
        try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(1); }
        const j = JSON.parse(raw);
        const list = j?.result?.backends ?? j?.backends ?? [];
        if (!list.length) process.exit(1);
        const name = list[0].name || '';
        const id = name.split('/').pop() || list[0].backendId || list[0].id;
        if (!id) process.exit(1);
        console.log(id);
      "  )" || true
fi

if [ -z "$BACKEND" ]; then
  echo ""
  echo "Could not detect backend ID. Set it explicitly:"
  echo "  APPHOSTING_BACKEND=YOUR_BACKEND_ID ./scripts/setup-apphosting-secrets-access.sh"
  echo ""
  echo "Find it in Firebase Console → App Hosting → your backend → Settings."
  exit 1
fi

echo "→ Backend: $BACKEND"
echo "→ Location: $LOCATION"
echo "→ Secrets ($(echo "$SECRETS" | tr ',' '\n' | wc -l | tr -d ' ') total)"

echo ""
echo "→ Granting Secret Manager access to App Hosting…"
firebase apphosting:secrets:grantaccess "$SECRETS" \
  --project "$PROJECT" \
  --backend "$BACKEND" \
  --location "$LOCATION"

echo ""
echo "→ Creating rollout from branch $BRANCH…"
firebase apphosting:rollouts:create "$BACKEND" \
  --project "$PROJECT" \
  --git-branch "$BRANCH" \
  --force

echo ""
echo "Done. When the rollout is Live, verify Dhan TOTP:"
echo "  curl -s \"https://tezterminal.com/api/admin/dhan-token?key=YOUR_CRON_SECRET\""
echo "  curl -s -X POST \"https://tezterminal.com/api/admin/dhan-token?key=YOUR_CRON_SECRET&action=totp\""
