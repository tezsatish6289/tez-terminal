# FNONINJA Frontend

UI-only repo for [fnoninja.com](https://fnoninja.com/) — landing page, levels dashboard, learn articles, webinar, and legal pages.

**Backend stays in the private `tez-terminal` monorepo** (APIs, Firebase admin, crons, secrets). This repo is safe to share with designers (e.g. Lovable).

## Pages in scope

| Public URL | Internal route |
|---|---|
| `/` | `/fnoninja` |
| `/levels`, `/levels/chart` | `/fnoninja/levels/*` |
| `/learn/*` | `/fnoninja/learn/*` |
| `/webinar` | `/fnoninja/webinar` |
| `/contact`, `/privacy`, `/terms` | `/fnoninja/*` |

## Local dev

```bash
npm install
cp .env.example .env.local   # add Firebase client keys
npm run dev                  # http://localhost:9003
```

API routes are **proxied** to production by default (`next.config.ts` → `FNONINJA_API_ORIGIN=https://fnoninja.com`). To hit a local backend:

```bash
FNONINJA_API_ORIGIN=http://localhost:9002 npm run dev
```

(Run `tez-terminal` on port 9002 in another terminal.)

## Sync with tez-terminal (production)

Paths listed in `SYNC_PATHS.txt` are the contract between repos.

**Export from monorepo → this repo** (maintainers, when bootstrapping or pulling backend-side UI fixes):

```bash
# in tez-terminal
./scripts/export-fnoninja-frontend.sh
```

**Merge designer changes → production** (after PRs land on `main` here):

```bash
# in tez-terminal
./scripts/sync-fnoninja-frontend-to-tez-terminal.sh ../fnoninja-frontend
git diff   # review
git commit && git push   # deploys via Firebase App Hosting
```

Or open the auto-sync PR created by `.github/workflows/sync-to-tez-terminal.yml`.

## What not to add here

- `src/app/api/**` — server routes live in tez-terminal
- `src/firebase/admin.ts` — server Firebase
- Server-only libs (`sr-replays.ts`, `webinar-stats.ts`, `news.ts`, etc.)

## Deploy

Production deploys from **`tez-terminal` `main` only**. This repo is for design iteration; merging/syncing into tez-terminal is what ships to fnoninja.com.
