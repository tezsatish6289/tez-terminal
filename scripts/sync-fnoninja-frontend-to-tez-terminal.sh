#!/usr/bin/env bash
# Pull UI from fnoninja-frontend into tez-terminal (production monorepo).
# Usage: ./scripts/sync-fnoninja-frontend-to-tez-terminal.sh [source-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/../fnoninja-frontend}"
MANIFEST="$SRC/SYNC_PATHS.txt"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing $MANIFEST — run export first or pass valid fnoninja-frontend path."
  exit 1
fi

echo "→ Syncing fnoninja frontend from $SRC into $ROOT"

while IFS= read -r path || [[ -n "$path" ]]; do
  [[ -z "$path" || "$path" =~ ^# ]] && continue
  if [[ ! -e "$SRC/$path" ]]; then
    echo "  skip (missing in source): $path"
    continue
  fi
  mkdir -p "$ROOT/$(dirname "$path")"
  if [[ -d "$SRC/$path" ]]; then
    rsync -a "$SRC/$path/" "$ROOT/$path/"
  else
    cp "$SRC/$path" "$ROOT/$path"
  fi
  echo "  synced $path"
done < "$MANIFEST"

echo "→ Sync complete. Review diff, then commit tez-terminal and deploy."
