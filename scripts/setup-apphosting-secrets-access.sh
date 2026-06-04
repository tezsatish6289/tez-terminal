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
BRANCH="${APPHOSTING_BRANCH:-main}"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Install Firebase CLI: npm install -g firebase-tools"
  exit 1
fi

echo "→ Project: $PROJECT"
firebase use "$PROJECT" >/dev/null

ALL_SECRETS=()
while IFS= read -r name; do
  [ -n "$name" ] && ALL_SECRETS+=("$name")
done < <(grep -E '^\s+secret:' apphosting.yaml | sed 's/.*secret:[[:space:]]*//')

if [ "${#ALL_SECRETS[@]}" -eq 0 ]; then
  echo "No secrets found in apphosting.yaml"
  exit 1
fi

EXISTING_SECRETS=()
MISSING_SECRETS=()
echo "→ Checking Secret Manager..."
for name in "${ALL_SECRETS[@]}"; do
  if firebase apphosting:secrets:describe "$name" --project "$PROJECT" >/dev/null 2>&1; then
    EXISTING_SECRETS+=("$name")
  else
    MISSING_SECRETS+=("$name")
  fi
done

if [ "${#MISSING_SECRETS[@]}" -gt 0 ]; then
  echo "   Skipping ${#MISSING_SECRETS[@]} secret(s) not in GCP yet:"
  printf '   - %s\n' "${MISSING_SECRETS[@]}"
fi

if [ "${#EXISTING_SECRETS[@]}" -eq 0 ]; then
  echo "No secrets from apphosting.yaml exist in Secret Manager. Create them in GCP first (Part B)."
  exit 1
fi

SECRETS="$(printf '%s,' "${EXISTING_SECRETS[@]}")"
SECRETS="${SECRETS%,}"

BACKEND="${APPHOSTING_BACKEND:-tez-terminal}"
LOCATION="${APPHOSTING_LOCATION:-asia-southeast1}"

if [ "$BACKEND" = "tez-terminal" ] && [ -z "${APPHOSTING_BACKEND:-}" ]; then
  echo "→ Using default backend: tez-terminal (asia-southeast1)"
else
  echo "→ Listing App Hosting backends..."
  DETECTED="$(
    firebase apphosting:backends:list --project "$PROJECT" --json 2>/dev/null \
      | node -e "
        const fs = require('fs');
        let raw = '';
        try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(1); }
        const j = JSON.parse(raw);
        const list = Array.isArray(j?.result)
          ? j.result
          : Array.isArray(j?.result?.backends)
            ? j.result.backends
            : Array.isArray(j?.backends)
              ? j.backends
              : [];
        if (!list.length) process.exit(1);
        const preferred =
          list.find((b) => (b.name || '').includes('/asia-southeast1/') && (b.name || '').endsWith('/tez-terminal')) ||
          list.find((b) => (b.name || '').includes('/asia-southeast1/')) ||
          list[0];
        const name = preferred.name || '';
        const parts = name.split('/');
        const regionIdx = parts.indexOf('locations');
        const backendIdx = parts.indexOf('backends');
        const id =
          backendIdx >= 0
            ? parts[backendIdx + 1]
            : name.split('/').pop() || preferred.backendId || preferred.id;
        const region = regionIdx >= 0 ? parts[regionIdx + 1] : 'asia-southeast1';
        if (!id) process.exit(1);
        console.log(id + '|' + region);
      "  )" || true
  if [ -n "$DETECTED" ]; then
    BACKEND="${DETECTED%%|*}"
    LOCATION="${DETECTED#*|}"
  fi
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
echo "→ Granting ${#EXISTING_SECRETS[@]} secret(s)"

echo ""
echo "→ Granting Secret Manager access to App Hosting..."
firebase apphosting:secrets:grantaccess "$SECRETS" \
  --project "$PROJECT" \
  --backend "$BACKEND" \
  --location "$LOCATION"

echo ""
echo "→ Creating rollout from branch $BRANCH..."
firebase apphosting:rollouts:create "$BACKEND" \
  --project "$PROJECT" \
  --git-branch "$BRANCH" \
  --force

echo ""
echo "Done. When the rollout is Live, verify Dhan TOTP:"
echo "  curl -s \"https://tezterminal.com/api/admin/dhan-token?key=YOUR_CRON_SECRET\""
echo "  curl -s -X POST \"https://tezterminal.com/api/admin/dhan-token?key=YOUR_CRON_SECRET&action=totp\""
