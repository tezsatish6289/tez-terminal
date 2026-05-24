# Zone Bots — Design Doc

Status: **DRAFT** · Owner: Satish · Last updated: 2026-05-16

A signal-free trading mode that opens trades purely from Deribit-OI-derived
zones. Four bots, one per coin: **BitcoinBot · EthereumBot · SolanaBot · XRPBot**.

The existing pattern-signal flow continues alongside; zone bots are additive.

---

## 1. Behaviour summary

For each of the 4 coins:

1. Every 15 min, a single cron loops all coins. Per coin:
   1. Pull Deribit OI → compute bull/bear strikes, max-pain values, TPs
      (re-uses `computeOptionsZones`).
   2. Zone picker (`options-zones`): potent walls **near** day-0 max pain
      (anchor span ~2.5% spot / 2.5× IV reach), absolute OI floor per
      asset, highest OI then closest to pin; bull below / bear above max
      pain; **sticky** bands while spot stays inside the published range.
   3. Persist suggested zones for the coin.
   4. Append the latest spot to a rolling price-history window.
   5. Run zone-confirmation check (15 min default, configurable per coin):
      - BULL: every sample ≥ `bullZoneLow` AND no new lows in 2nd half of window
      - BEAR: every sample ≤ `bearZoneHigh` AND no new highs in 2nd half of window
   6. Apply state transitions (see §3).

2. State transitions are gated:
   - **Open** a trade when zone goes from `IDLE/CONFIRMING` → `ACTIVE` AND the
     bot has no open trade.
   - **Flip** (close + reverse) when the opposite side becomes `ACTIVE`
     (i.e., re-confirmed for the full window).
   - **Hold** between zones (price exited zone but opposite not confirmed yet) —
     existing SL/TPs/trailing handle the trade.

3. Trade params (zone-derived):
   - Side: BUY (bull) / SELL (bear)
   - Entry: market price at the tick the zone confirms
   - SL: `bullZoneLow − halfWidth` (bull) / `bearZoneHigh + halfWidth` (bear)
   - TP1/TP2/TP3: `entry ± 1R / 2R / 3R` where `R = |entry − SL|`
   - Position size: existing risk model
     (`risk% × capital / SL_distance × leverage`)
   - Hard cap: existing 3% Max SL distance — skip trade if `SL_distance > 3%`

4. TP/SL management = **identical** to existing pattern bot:
   - 50% of TP1 reached → SL → BE
   - TP1 hit → close 20%
   - TP2 hit → SL → TP1 (0% close)
   - TP3 hit → SL → TP2 (0% close)
   - Beyond TP3 → trail SL behind high-watermark by `(TP3 − TP2)`
   - SL hit → close remainder

5. Re-entry: no explicit cooldown. The rolling confirmation window is the
   natural cooldown (an SL hit produces a fresh low/high, fails the
   "no new lows/highs in 2nd half" check until price reclaims the zone).

---

## 2. Firestore schema

### New per-asset documents

For each `asset ∈ {btc, eth, sol, xrp}`:

| Path | Purpose |
|---|---|
| `config/zone_bot_${asset}_settings` | User-tunable per-coin config (half-width, confirm minutes, max-pain min distance, max-pain exit proximity, manual override AUTO/OFF) |
| `config/suggested_zones_${asset}` | Cron-written: latest bull/bear strikes, zone bands, max-pain by expiry, TP targets, computedAt |
| `config/zone_bot_${asset}_state` | Cron-written: current direction (`BULL`/`BEAR`/`IDLE`), confirmation status, rolling priceHistory, openTradeId, lastFlipAt, last reason string |

### Renaming the existing BTC heatmap (migration)

The current docs are implicitly BTC-only:

| Current | Renamed to |
|---|---|
| `config/heatmap_zones` | `config/zone_bot_btc_settings` |
| `config/suggested_zones` | `config/suggested_zones_btc` |
| `config/heatmap_auto_status` | `config/zone_bot_btc_state` |

A one-shot migration script copies the docs under the new names and the old
ones become read-fallbacks for one release, then are removed.

### New field on `simulator_trades`

```ts
botSource:
  | "PATTERN"        // legacy / existing pattern-signal trades
  | "BTC_ZONE"
  | "ETH_ZONE"
  | "SOL_ZONE"
  | "XRP_ZONE";
```

Backfill: existing closed trades → `"PATTERN"`. New zone trades stamp the
correct source on open.

`live_trades` gets the same field (for the live deployments).

### New field on `simState`

```ts
streakWins: number;           // global win-streak counter (shared)
```

(already present — just confirming it remains global, not per-bot.)

---

## 3. State machine per zone bot

```
                ┌──────────┐
                │   IDLE   │  (no active zone OR no historic confirmation)
                └────┬─────┘
        zone valid + price inside zone
                     │
                     ▼
                ┌──────────────┐
                │ CONFIRMING   │  rolling window check in progress
                │  N / 15 min  │
                └────┬───┬─────┘
                     │   │ window fails (broke floor / new lows)
        window      │   │
        passes      ▼   ▼
                ┌──────────┐         opposite side becomes ACTIVE
                │  ACTIVE  │ ─────────────────────────────────────┐
                │  trade   │                                       │
                │   open   │ <- price between zones: HOLD trade   │
                └────┬─────┘                                       │
                     │ trade hits TP3 / SL / trailing exit         │
                     ▼                                              │
                ┌──────────┐                                        │
                │  IDLE    │ <─────────── flip ── close current + open opposite
                └──────────┘
```

State persisted in `config/zone_bot_${asset}_state`:

```ts
{
  direction: "BULL" | "BEAR" | "IDLE";
  confirming: { side: "BULL" | "BEAR"; minutesHeld: number } | null;
  openTradeId: string | null;
  lastFlipAt: string | null;
  reason: string;          // human-readable status for UI
  priceHistory: { price, ts }[];   // rolling window (cap 35 points)
  updatedAt: string;
}
```

---

## 4. Modules

### `src/lib/zone-bot-config.ts`
- Per-asset settings parser (mirrors `parseZones`)
- `loadZoneBotSettings(db, asset)` / `loadAllZoneBotSettings(db)`
- Defaults table for the 4 coins (half-width, max-pain min distance)

### `src/lib/zone-bot-engine.ts`
Pure functions, fully unit-testable:
- `evaluateZoneBot(asset, spot, suggested, settings, state, history)` →
  `{ nextState, action }` where `action` is one of
  `{ type: "NONE" } | { type: "OPEN", side, entryPrice, sl, tp1, tp2, tp3 } | { type: "CLOSE", reason } | { type: "FLIP", closeReason, openSide, ... }`
- Re-uses `checkZoneConfirmation` (already in `heatmap-zones-settings.ts`,
  moved to a shared location).

### `src/lib/zone-bot-trade.ts`
- `openZoneSimTrade(state, action, simConfig)` → SimTrade (uses existing
  position-sizing helpers, stamps `botSource`)
- Re-uses existing TP/SL execution paths in `simulator.ts` and `trade-engine.ts`
  by feeding zone-derived `stopLoss / tp1 / tp2 / tp3` exactly as a pattern
  signal would.

### `src/app/api/cron/sync-zone-bots/route.ts` (NEW)
Single 15-min cron. Per tick:
1. Fetch all 4 settings docs in parallel
2. Fetch `config/exchange_prices` once
3. For each coin (in parallel):
   - Compute zones (`computeOptionsZones` with per-asset opts)
   - Persist `suggested_zones_${asset}`
   - Append spot to price history; load state
   - Call `evaluateZoneBot(...)`
   - Execute action: open/close/flip simulator trade (+ per-user live trades)
   - Persist new state
4. Increment global `streakWins` based on closed-trade results

### `src/app/api/cron/sync-simulator/route.ts` (EXISTING)
- Continues to run every minute for pattern-signal trades
- Picks up zone-bot trade SL/TP/trailing exits too (same `simulator_trades`
  collection, same engine), since zone trades are stored with the same
  shape — just a different `botSource`.

---

## 5. UI changes

### `tezterminal.com/simulation`

```
┌──────────────────────────────────────────────────────────┐
│ HEATMAP AUTO-SWITCH                                       │
│ ┌─ BTC ─┬─ ETH ─┬─ SOL ─┬─ XRP ─┐                         │
│ │ AUTO/OFF, zones, max-pain, half-width,                  │
│ │ confirm window, max-pain min distance,                  │
│ │ refresh button.  (one panel per tab)                    │
│ └──────────────────────────────────────────────────────┘  │
│                                                          │
│ TUNE PARAMETERS  (shared, unchanged)                     │
│                                                          │
│ PERFORMANCE                                              │
│ ┌─ All ─┬─ Pattern ─┬─ BTC Zone ─┬─ ETH Zone ─┬─ SOL ─┬─ XRP ─┐│
│ │  Headline stats · equity curve · history table         │ │
│ │  (filtered by botSource; All shows real shared curve)  │ │
│ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Same structure on `/freedombot/performance` and `/freedombot/records`.

### Components

- `HeatmapAutoSwitch.tsx` → introduce internal tabs (Radix Tabs) and lift
  asset selector to top of card; the existing JSX becomes the BTC tab body,
  the other 3 tabs render the same structure parameterised by `asset`.
- New `BotFilter.tsx` → pill row that drives a `botSource` filter state.
- `EquityCurve.tsx` → accepts `mode: "real" | "counterfactual"`:
  - `real`: walks ALL trades chronologically against `startingCapital`
  - `counterfactual`: walks filtered trades against `startingCapital`
- `TradeList.tsx` / `MobileTradeCard` → respect `botSource` filter; add a
  small `BTC ZONE` / `ETH ZONE` / etc. badge next to the symbol.

---

## 6. Live deployment

### New bot definitions

Add 4 new bots to whatever registry today defines BotPro etc.:

- `BitcoinBot` (symbol `BTCUSDT.P`)
- `EthereumBot` (symbol `ETHUSDT.P`)
- `SolanaBot` (symbol `SOLUSDT.P`)
- `XRPBot` (symbol `XRPUSDT.P`)

Each is independently subscribable. Per-user setting:

```ts
users/{uid}/zone_bots: {
  btc:  { enabled: false, exchange?: "BYBIT" | "COINDCX" | "HYPERLIQUID" };
  eth:  { enabled: false, exchange?: ... };
  sol:  { enabled: false, exchange?: ... };
  xrp:  { enabled: false, exchange?: ... };
}
```

When `sync-zone-bots` decides to open a zone trade, it iterates enabled
deployments per coin and places the live order on the user's chosen exchange
(re-using existing `executeForAllUsers` + `placeMarketOrder` primitives).

### Pattern-signal flow on live

Unchanged. The BTC tab's settings already gate pattern-signal trades (macro
on/off based on BTC heatmap). The BTC zone bot is just an additional consumer
of the same BTC tab.

---

## 7. Migration plan

1. Land the schema rename behind a compat shim:
   - `loadEffectiveHeatmapZones(...)` reads from `zone_bot_btc_settings`
     first, falls back to `heatmap_zones` if absent.
   - Write to BOTH for one release.
   - `parseZones` aliased as `parseZoneBotSettings`.
2. Backfill `botSource = "PATTERN"` on all existing trades
   (`simulator_trades` + `live_trades`) via a one-shot admin script.
3. Ship BTC tab in the new tabbed UI (only BTC visible initially).
4. Ship ETH zone bot end-to-end (settings, cron, UI tab).
5. Ship SOL + XRP together.
6. Remove the read-fallbacks once all production reads point at the new docs.

---

## 8. Rollout plan — BTC first, clone later

### Phase 1 — Ship BitcoinBot only

Build the BTC zone bot end-to-end on simulator + live. Run it in production
for a couple of weeks, watch for whipsaws, bad zones, edge cases. Tune
defaults from real data.

| # | PR | Scope |
|---|----|-------|
| 1 | `feat(zone-bot): scaffold settings + state types + defaults` | Parser, defaults table, per-asset Firestore doc shapes. Code is asset-parameterised from day 1 (function signatures take `asset: "btc"`) but only BTC is registered. |
| 2 | `feat(zone-bot): pure engine (evaluateZoneBot)` | `zone-bot-engine.ts` + unit tests. State machine, no side effects. |
| 3 | `feat(zone-bot): rename heatmap docs + botSource field + backfill` | Schema rename with compat shim, backfill `simulator_trades` + `live_trades` with `botSource = "PATTERN"`. |
| 4 | `feat(zone-bot): cron sync-zone-bots (BTC sim only)` | New cron, opens/closes sim trades for BTC zone bot only. Pattern bot unchanged. |
| 5 | `feat(ui): bot-filter tabs on simulation + counterfactual equity` | `[All] [Pattern] [BTC Zone]` filter on `/simulation`. Equity curve `mode` prop. |
| 6 | `feat(ui): mirror bot-filter on /freedombot/performance + /records` | Public dashboards consistency. |
| 7 | `feat(zone-bot): live deployment (BitcoinBot)` | Per-user opt-in (`secrets.zoneBotsEnabled.btc`), `executeForAllUsers(botSource: "BTC_ZONE")`, ExchangeSettings UI toggle, `sync-live-trades` close-mirror whitelist extended with `ZONE_BOT_FLIP` and `ZONE_BOT_FLIP_BLOCKED` (formerly `ZONE_BOT_MAX_PAIN_EXIT` until the max-pain exit was retired 2026-05-23). |
| 7.1 | `chore(zone-bot): retire legacy BTC zone block in sync-simulator` | Removes the in-line BTC zone trade opener inside `/api/cron/sync-simulator`. With sync-zone-bots live, that block would (a) double-fire on the same confirmation (1-min vs 15-min cadence) and (b) bypass PR #7's opt-in safety because it never stamped `botSource: "BTC_ZONE"`. Pattern-bot pipeline unchanged. |

After PR #7, BitcoinBot is fully live and observable. Pause here to watch real
performance and tune defaults.

#### PR #7 — what shipped (live mirroring)

- **Opt-in by default-off**: existing pattern-bot users are NOT auto-
  enrolled. Each user must toggle `BTC Zone Bot` ON in
  `ExchangeSettings` per crypto exchange. Stored as
  `users/{uid}/secrets/{exchangeId}.zoneBotsEnabled.btc = true`.
- **executeForAllUsers** gained a `botSource` param (default
  `"PATTERN"` for legacy callers). The per-user discovery loop calls
  `userOptedIntoBot(secretData, botSource)` AFTER the existing
  `autoTradeEnabled === true` check. PATTERN always passes; zone-bot
  values require the explicit opt-in. Unknown botSource is REFUSED
  (defensive: future bots can't silently mirror to pattern users).
- **executeTrade** stamps `botSource` on the new `LiveTrade`, so
  dashboards and downstream cron logic can route by it.
- **`sync-zone-bots` openZoneBotTrade** now calls `executeForAllUsers`
  with `botSource: ZONE_BOT_SOURCE[asset]` immediately after writing
  the sim trade. Best-effort: a thrown live-mirror call is logged but
  doesn't unwind the sim trade.
- **Close mirroring** rides the existing `sync-live-trades` cron. Its
  sim-driven close-reason whitelist was extended from `{TRAILING_SL}`
  to `{TRAILING_SL, ZONE_BOT_FLIP, ZONE_BOT_FLIP_BLOCKED}` (formerly
  `ZONE_BOT_MAX_PAIN_EXIT`; max-pain exit was retired 2026-05-23 and
  trades now exit purely on their own SL / TP / trailing-SL). Pattern-
  bot mirror behaviour is unchanged.
- **`closeZoneBotTrade` exitType** for the CLOSE action (flip-blocked
  fallback when opposite-side confirmed but new flip SL too wide) is
  `"SL"` — full 100% exit, original thesis is dead.

### Phase 2 — Clone for ETH / SOL / XRP

Once BitcoinBot has proven itself, adding the other 3 is mostly mechanical
because the code from Phase 1 is already asset-parameterised. The work
becomes:

| # | PR | Scope |
|---|----|-------|
| 8 | `feat(zone-bot): per-asset tabs in HeatmapAutoSwitch` | UI restructure — current BTC panel becomes the BTC tab; add empty ETH/SOL/XRP tabs scaffolded with placeholder messages. |
| 9 | `feat(zone-bot): register ETH coin (cron + settings + UI)` | Add ETH to the asset registry, Firestore docs, defaults from §1. Cron auto-loops over it. UI tab activates. |
| 10 | `feat(zone-bot): register SOL coin` | Same as #9, repeated. |
| 11 | `feat(zone-bot): register XRP coin` | Same as #9, repeated. |
| 12 | `feat(zone-bot): live deployment EthereumBot / SolanaBot / XRPBot` | Per-user toggles + live execution for the 3 new coins. |
| 13 | `chore(zone-bot): remove legacy heatmap read-fallbacks` | Final cleanup. |

### Why this ordering works

- **Phase 1 PR #1–#4 is the riskiest** — defines the contract for everything.
  Building it once for BTC validates the abstraction before we commit it to
  4 coins.
- **PR #6 (live deployment)** ships before PR #8 (UI tabs) on purpose — the
  cron + sim is the real product; UI tabs are cosmetic until the second coin
  is added.
- **Phase 2 PRs are each tiny** (just register a coin) because the design did
  the abstraction up-front in Phase 1.

Each PR is independently shippable and reversible.

---

## 9. Open questions / risks

- **Correlated zone-bot losses.** If BTC/ETH/SOL/XRP all flip bull together
  and trend reverses, we could take 4 simultaneous losses on the same move.
  Not enforced in v1 — we'll observe and add a `maxConcurrentZoneTrades` cap
  if needed.
- **Re-entry whipsaw.** No cooldown in v1. If we see ping-ponging in
  production, we'll add a per-bot lockout (e.g., min 30 min since last close).
- **OI thinness on SOL/XRP.** Defaults are wider relative to spot. May need
  manual tuning in first week.
- **15-min cron gap on flip.** A flip could happen up to 15 min late. For
  scalping that's a lot; for zone-based macro trades it's acceptable. Can
  drop to 5-min cron if needed.

---

## 10. Out of scope (v1)

- Backtests on historical Deribit OI (would need to scrape archive).
- Volatility-scaling of zone widths (using DVOL).
- Cross-bot capital allocation enforcement (`maxConcurrentZoneTrades`).
- Per-bot win-streak counters (decided: global counter for v1).
- Re-entry cooldowns (decided: rely on rolling window for v1).
