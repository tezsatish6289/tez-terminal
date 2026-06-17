# FNONINJA daily cluster videos

Automated 9:16 short videos (Remotion) for the two daily posts:

- **ClusterPut** — 5 stocks on a massive **put wall** (support / bullish lean)
- **ClusterCall** — 5 stocks under a massive **call wall** (resistance / bearish lean)

Each video: animated intro → 5 stock segments (candles + OI-cluster bands +
callouts) → mid-roll fnoninja.com CTA → recap → strong end card. Persistent
logo watermark + "not advice" footer throughout. Captions + motion, no voiceover.

## Preview (sample data, zero setup)

```bash
cd video
npm install
npm run studio          # opens Remotion Studio at localhost:3000
```

## Render an MP4

```bash
npm run render:put      # → out/put-cluster.mp4   (sample data)
npm run render:call     # → out/call-cluster.mp4
npm run still           # → out/frame.png         (single frame check)
```

## Use real data from the app

1. Run the tez-terminal dev server (it has the Dhan/NSE/Firebase creds wired):

```bash
# repo root
npm run dev             # http://localhost:9002
```

2. Build today's props (ranks the F&O universe by put/call OI, pulls candles):

```bash
cd video
BASE_URL=http://localhost:9002 npm run fetch   # → out/put.json, out/call.json
```

3. Render with the real props:

```bash
npm run render:put  -- --props=out/put.json
npm run render:call -- --props=out/call.json
```

## Data shape

`src/schema.ts` is the source of truth (`VideoData`). It mirrors the app's
`PublicLevels` cluster fields (`putClusterSize`, `callClusterStrike`, …) so the
fetch script is a thin projection of existing public endpoints — no methodology
leaves the app.
