#!/usr/bin/env bash
# Export fnoninja.com UI from tez-terminal → fnoninja-frontend repo.
# Run from tez-terminal root: ./scripts/export-fnoninja-frontend.sh [dest]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/../fnoninja-frontend}"

echo "→ Exporting fnoninja frontend to $DEST"

mkdir -p "$DEST"/{src/app,src/components,src/lib,src/hooks,src/firebase,public,scripts}

copy_dir() {
  local src="$1"
  local dst="$2"
  if [[ -d "$ROOT/$src" ]]; then
    mkdir -p "$DEST/$dst"
    rsync -a --delete "$ROOT/$src/" "$DEST/$dst/"
    echo "  copied $src"
  fi
}

copy_file() {
  local src="$1"
  local dst="${2:-$1}"
  if [[ -f "$ROOT/$src" ]]; then
    mkdir -p "$DEST/$(dirname "$dst")"
    cp "$ROOT/$src" "$DEST/$dst"
    echo "  copied $src"
  fi
}

# App routes
copy_dir "src/app/fnoninja" "src/app/fnoninja"
copy_dir "src/app/embed/levels-bubbles" "src/app/embed/levels-bubbles"

# Components
copy_dir "src/components/fnoninja" "src/components/fnoninja"
copy_dir "src/components/levels" "src/components/levels"
mkdir -p "$DEST/src/components/ui"
# Replace UI subset — drop unused shadcn files from prior full exports
find "$DEST/src/components/ui" -maxdepth 1 -name '*.tsx' -delete 2>/dev/null || true
for f in button carousel dropdown-menu popover sheet toast toaster; do
  copy_file "src/components/ui/$f.tsx" "src/components/ui/$f.tsx"
done
copy_file "src/components/sr-audit/SrStoryReplayCanvas.tsx"
copy_file "src/components/seo/JsonLd.tsx"
copy_file "src/components/ReferralTracker.tsx"
copy_file "src/components/FirebaseErrorListener.tsx"

# Hooks
for f in useFnoNinjaFavslide use-chat-messages use-chat-member use-chat-presence use-subscription use-toast; do
  copy_file "src/hooks/$f.ts"
done

# Public assets
copy_dir "public/fnoninja" "public/fnoninja"
copy_file "public/favicon.svg"

# Firebase client
copy_dir "src/firebase" "src/firebase"
rm -f "$DEST/src/firebase/admin.ts" 2>/dev/null || true

# lib/fnoninja — UI-safe only
mkdir -p "$DEST/src/lib/fnoninja"
for f in theme responsive paths metadata seo learn-content liveslide-walkthrough-content \
  favslide-walkthrough-content pricing webinar social-links auth post-login-redirect logo-mark \
  favslide sr-replay-types sr-replay-columns market-ticker-types use-learn-nifty-live-data; do
  copy_file "src/lib/fnoninja/$f.ts" "src/lib/fnoninja/$f.ts"
done

# lib/freedombot
copy_file "src/lib/freedombot/responsive.ts"

# lib/levels (exclude server-only)
mkdir -p "$DEST/src/lib/levels"
for f in "$ROOT"/src/lib/levels/*.ts; do
  base="$(basename "$f")"
  case "$base" in
    news.ts|fynn-plan-cache.ts|fynn-plan-rules.ts|fynn-plan-validate.ts|levels-cron-dashboard.ts) continue ;;
  esac
  cp "$f" "$DEST/src/lib/levels/$base"
done
echo "  copied src/lib/levels (client subset)"

# lib/zones (exclude server store)
mkdir -p "$DEST/src/lib/zones"
for f in "$ROOT"/src/lib/zones/*.ts; do
  base="$(basename "$f")"
  [[ "$base" == "oi-momentum-store.ts" ]] && continue
  cp "$f" "$DEST/src/lib/zones/$base"
done
echo "  copied src/lib/zones (client subset)"

# lib/chat client
mkdir -p "$DEST/src/lib/chat"
for f in client constants types moderation; do
  copy_file "src/lib/chat/$f.ts" "src/lib/chat/$f.ts"
done

# Other shared libs (client-safe only — no zone-bot-engine / server NSE)
for f in countries index-specs market-hours utils admin-emails-client ist-display; do
  copy_file "src/lib/$f.ts"
done
copy_file "src/lib/seo/noindex-metadata.ts"
copy_file "src/lib/seo/constants.ts"
copy_file "src/lib/nse/fno-company-names.ts"
copy_file "src/lib/nse/fno-universe.ts"
copy_file "src/lib/sr-audit/story-replay-types.ts"

# fnoninja-only middleware (localhost + fnoninja.com rewrites)
copy_file "scripts/fnoninja-frontend/bootstrap/src/middleware.ts" "src/middleware.ts"

# Sync manifest
copy_file "scripts/fnoninja-frontend/SYNC_PATHS.txt" "SYNC_PATHS.txt"

# Bootstrap repo-only files (only if missing in dest)
BOOT="$ROOT/scripts/fnoninja-frontend/bootstrap"
for f in package.json tsconfig.json tailwind.config.ts postcss.config.mjs components.json next.config.ts \
  .gitignore .env.example README.md src/app/layout.tsx src/app/globals.css; do
  if [[ ! -e "$DEST/$f" && -f "$BOOT/$f" ]]; then
    mkdir -p "$DEST/$(dirname "$f")"
    cp "$BOOT/$f" "$DEST/$f"
    echo "  bootstrapped $f"
  fi
done

# GitHub sync workflow (always refresh from template)
if [[ -f "$BOOT/.github/workflows/sync-to-tez-terminal.yml" ]]; then
  mkdir -p "$DEST/.github/workflows"
  cp "$BOOT/.github/workflows/sync-to-tez-terminal.yml" "$DEST/.github/workflows/sync-to-tez-terminal.yml"
  echo "  copied sync workflow"
fi

echo "→ Done. Next: cd $DEST && npm install && npm run dev"
