# FNONINJA frontend split (fnoninja.com UI)

Designers polish UI in **`fnoninja-frontend`** (Lovable-friendly). Production ships from **`tez-terminal` `main`** via Firebase App Hosting — one deploy, same backend.

## Repos

| Repo | Contains |
|---|---|
| **tez-terminal** (private) | APIs, Firebase admin, crons, secrets, full Next.js app |
| **fnoninja-frontend** (designer access) | fnoninja.com pages only — components, routes, client libs |

## Pages in scope

- `/` landing
- `/levels`, `/levels/chart`, chat panel (`/levels?chat=1`)
- `/learn/*`
- `/webinar`, `/contact`, `/privacy`, `/terms`
- `/embed/levels-bubbles`

## Workflows

### Bootstrap or refresh frontend repo from monorepo

```bash
./scripts/export-fnoninja-frontend.sh          # → ../fnoninja-frontend
cd ../fnoninja-frontend && npm install && npm run dev   # http://localhost:9003
```

The frontend repo proxies `/api/*` to `https://fnoninja.com` (or `FNONINJA_API_ORIGIN=http://localhost:9002` for local backend).

### Ship designer changes to production

After UI PRs merge on `fnoninja-frontend` `main`:

```bash
./scripts/sync-fnoninja-frontend-to-tez-terminal.sh ../fnoninja-frontend
git diff && git commit && git push
```

Or configure GitHub Actions secrets on `fnoninja-frontend`:

- `TEZ_TERMINAL_REPO` — e.g. `your-org/tez-terminal`
- `TEZ_TERMINAL_SYNC_TOKEN` — PAT with repo scope on tez-terminal

The workflow opens a sync PR on tez-terminal automatically.

## Sync contract

`scripts/fnoninja-frontend/SYNC_PATHS.txt` lists paths that round-trip between repos. **Not synced:** `src/middleware.ts` (monorepo keeps multi-host routing; frontend repo uses fnoninja-only middleware), `src/app/api/**`, server-only libs.

## New features

1. Build API / data logic in **tez-terminal**
2. Build or polish UI in **fnoninja-frontend**
3. Sync UI paths into tez-terminal and deploy
