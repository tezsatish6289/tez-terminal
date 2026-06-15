/**
 * Zone Bot — pure decision engine.
 *
 * Given the latest spot, suggested zones, settings, and prior state,
 * decides whether to OPEN / CLOSE / FLIP / NONE. Has zero side effects
 * (no Firestore, no Date.now, no fetch) — caller injects everything.
 *
 * The cron consumes the returned `action` to actually create / close
 * `simulator_trades` and `live_trades` rows.
 *
 * See `docs/zone-bots.md` §1, §3 for the full state-machine spec.
 *
 * ──────────────────────────────────────────────────────────────────────
 * State machine summary
 * ──────────────────────────────────────────────────────────────────────
 * IDLE
 *   └─ price enters bull zone → CONFIRMING(BULL) (no trade)
 *   └─ price enters bear zone → CONFIRMING(BEAR) (no trade)
 *
 * CONFIRMING(side)
 *   └─ window passes → ACTIVE(side) + action=OPEN
 *   └─ window fails  → revert to IDLE
 *
 * ACTIVE(BULL) (trade open)
 *   └─ opposite (BEAR) confirms → action=FLIP (close BULL, open BEAR)
 *   └─ opposite (BEAR) confirms BUT new flip-trade SL would exceed
 *      MAX_SL_DISTANCE_PCT → action=CLOSE (kill the dying side without
 *      re-opening in a bad shape)
 *   └─ price exits zone (above bullExitAbove OR between zones)
 *      → action=NONE, trade keeps running on its trailing SL / TPs
 *
 * SL hits / TP3 hits etc. are managed by the existing sync-simulator
 * (or sync-live-trades) — the engine just tracks whether a trade is
 * open via `state.openTradeId`. Max-pain proximity exit was removed
 * 2026-05-23: lifecycle is uniform across bots and trades exit on
 * their own SL / TP / trailing-SL only.
 */

import type { ZoneBotAsset, ZoneBotSettings } from "./zone-bot-config";
import type { PricePoint, ZoneBotState } from "./zone-bot-state";
import {
  entryMeetsMinPocRR,
  entryPocRiskRewardRatio,
  formatPocRR,
  MIN_POC_RISK_REWARD,
} from "./zones/zone-status";

// ── Inputs and outputs ───────────────────────────────────────────────────

/** Minimal slice of `OptionsZones` (from `options-zones.ts`) that the
 *  engine actually needs. Keeping this narrow decouples the engine from
 *  the full suggester schema and makes it trivially mock-able in tests.
 *
 *  v2 (2026-05-19) adds regime/actionable flags computed by the suggester.
 *  They're optional so old docs in Firestore continue to work — when
 *  missing, the engine treats them as permissive defaults. */
export interface ZoneBotSuggestedZones {
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null;
  bearZoneHigh:  number | null;
  bearZoneLow:   number | null;
  bearExitBelow: number | null;
  /** Day-0 (today's) max pain price. Kept on the snapshot so the UI's
   *  price ladder can label it; the engine no longer reads it for exit
   *  decisions (max-pain proximity exit was retired 2026-05-23). */
  maxPain:       number | null;
  /** ISO timestamp when the suggester computed these zones. */
  computedAt:    string;

  // ── v2 regime flags (optional for back-compat) ────────────────────────
  /** Suggester says it's safe to fire fresh BULL entries (magnet pulls up,
   *  TP-room satisfied, no panic/conflict regime). Undefined → permissive
   *  default (treat as true if a bull zone exists). */
  bullActionable?: boolean;
  bearActionable?: boolean;
  /** ATM IV ≥ panic threshold OR IV term-structure inverted. Open trades
   *  unaffected; no fresh entries fire while this is true. */
  inPanicRegime?: boolean;
  /** Day-0 and day-1 max pains point opposite sides of spot — chop regime. */
  signalConflict?: boolean;
  /** Human-readable explanation surfaced into `state.reason` when neither
   *  side is actionable. */
  notActionableReason?: string | null;
  /** IV-scaled band half-width from the suggester — anchors SL one HW
   *  outside the zone edge (see `computeZoneSlAnchors`). */
  halfWidthUsd?: number | null;
}

export type ZoneBotAction =
  | { type: "NONE"; reason: string }
  | {
      type: "OPEN";
      side: "BUY" | "SELL";
      entryPrice: number;
      stopLoss:   number;
      tp1:        number;
      tp2:        number;
      tp3:        number;
      rDistance:  number;
      reason:     string;
    }
  | { type: "CLOSE"; reason: string }
  | {
      type: "FLIP";
      closeReason: string;
      openSide:    "BUY" | "SELL";
      entryPrice:  number;
      stopLoss:    number;
      tp1:         number;
      tp2:         number;
      tp3:         number;
      rDistance:   number;
      reason:      string;
    };

export interface EvaluateZoneBotInput {
  asset:     ZoneBotAsset;
  /** Latest spot price; null if the price feed failed. */
  spot:      number | null;
  /** Latest suggested zones (from `config/suggested_zones_${asset}`); null
   *  when the cron hasn't written any yet. */
  suggested: ZoneBotSuggestedZones | null;
  /** Per-asset user settings. */
  settings:  ZoneBotSettings;
  /** Previous state from `config/zone_bot_${asset}_state`. */
  state:     ZoneBotState;
  /** Rolling price-history window. Caller should have already appended
   *  the current spot before calling — engine treats this as the source
   *  of truth for confirmation checks. */
  history:   PricePoint[];
  /** Dep-injected clock so tests are deterministic. */
  now:       number;
}

export interface EvaluateZoneBotResult {
  nextState: ZoneBotState;
  action:    ZoneBotAction;
}

/** Spot reached day-0 max pain within tolerance (zone-bot partial exit). */
export function priceReachedMaxPain(
  side:          "BUY" | "SELL",
  spot:          number,
  maxPain:       number,
  toleranceUsd?: number | null,
): boolean {
  if (!Number.isFinite(spot) || !Number.isFinite(maxPain) || spot <= 0) return false;
  const tol =
    toleranceUsd != null && Number.isFinite(toleranceUsd) && toleranceUsd > 0
      ? toleranceUsd
      : Math.abs(spot) * 0.0005;
  if (side === "BUY") return spot >= maxPain - tol;
  return spot <= maxPain + tol;
}

function pocRRSkipReason(
  side:      "BULL" | "BEAR",
  tradeSide: "BUY" | "SELL",
  entry:     number,
  stopLoss:  number,
  maxPain:   number | null,
): string {
  const rr = maxPain != null
    ? entryPocRiskRewardRatio(tradeSide, entry, stopLoss, maxPain)
    : null;
  return `${side} confirmed but POC RR ${formatPocRR(rr)} < ${MIN_POC_RISK_REWARD}:1 — need major level`;
}

function passesEntryPocRR(
  side:      "BULL" | "BEAR",
  tradeSide: "BUY" | "SELL",
  entry:     number,
  stopLoss:  number,
  maxPain:   number | null,
): boolean {
  if (maxPain == null) return true; // permissive when magnet unknown (legacy docs)
  return entryMeetsMinPocRR(tradeSide, entry, stopLoss, maxPain);
}

// ── Constants ────────────────────────────────────────────────────────────

/** Suggested zones older than this are treated as missing.
 *  Matches the existing `loadEffectiveHeatmapZones` staleness window. */
const SUGGESTED_STALE_MS = 12 * 60 * 60 * 1000; // 12h

/** Hard upper bound on SL distance as a fraction of entry price.
 *
 *  Raised 2026-05-22 from 0.03 → 0.05 so ETH and SOL zone bots can
 *  actually fire trades. BTC's half-width is ~0.7% of spot (well under
 *  the 2%-of-spot cap), so worst-case entry at the top of the band
 *  gives slDistance ~2.5% — comfortably under both the old and new
 *  gates. ETH and SOL hit the strike-grid floor in `options-zones.ts`,
 *  which forces half-width to be 1–1.5% of spot. SL sits one half-width
 *  below the bull band (or above the bear band), so worst-case slDistance
 *  at band top is ~3 × halfWidth (~2–4% on majors). Position-sizing
 *  still caps risk-per-trade.
 *
 *  Still tighter than the pattern bot's full-confidence trades use
 *  (capped at SIM_CONFIG.MAX_SL_DISTANCE_PCT = 0.10) — this is the
 *  zone-bot-specific cap. */
const MAX_SL_DISTANCE_PCT = 0.05;

/** Noise tolerance (fraction of spot) applied to the zone-floor / no-new-
 *  lows checks. With BTC at $76k that's $53 — a single 1-sec wick that
 *  pierces the floor by $20 no longer resets the confirmation timer.
 *
 *  Derivation: 7 bps ≈ 1-σ over ~3 minutes at typical BTC IV (~30%).
 *  Smaller than the strike-grid spacing, larger than tick noise, anchored
 *  to a real timescale. Asset-agnostic — works for ETH/SOL/XRP unchanged. */
const CONFIRMATION_NOISE_PCT_OF_SPOT = 0.0007;

// ── Trade-parameter math ─────────────────────────────────────────────────

/** Resolve half-width for SL anchoring — prefer suggester field, else infer
 *  from symmetric band geometry on legacy Firestore docs. */
export function resolveZoneHalfWidthUsd(input: {
  halfWidthUsd?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
}): number | null {
  const { halfWidthUsd, bullZoneLow, bullZoneHigh, bearZoneLow, bearZoneHigh } =
    input;
  if (
    halfWidthUsd != null &&
    Number.isFinite(halfWidthUsd) &&
    halfWidthUsd > 0
  ) {
    return halfWidthUsd;
  }
  if (bullZoneLow != null && bullZoneHigh != null) {
    const w = (bullZoneHigh - bullZoneLow) / 2;
    if (Number.isFinite(w) && w > 0) return w;
  }
  if (bearZoneLow != null && bearZoneHigh != null) {
    const w = (bearZoneHigh - bearZoneLow) / 2;
    if (Number.isFinite(w) && w > 0) return w;
  }
  return null;
}

/** SL anchors one half-width outside the zone band — matches
 *  `options-zones.ts` TP-room design (2× HW to max pain ⇒ ≥2R when
 *  entry is near band center). Exported for UI ladder + live mirror. */
export function computeZoneSlAnchors(input: {
  halfWidthUsd?: number | null;
  bullZoneLow?: number | null;
  bullZoneHigh?: number | null;
  bearZoneLow?: number | null;
  bearZoneHigh?: number | null;
}): { bullSl: number | null; bearSl: number | null; halfWidthUsd: number | null } {
  const half = resolveZoneHalfWidthUsd(input);
  if (half == null) {
    return { bullSl: null, bearSl: null, halfWidthUsd: null };
  }
  const bullSl =
    input.bullZoneLow != null && Number.isFinite(input.bullZoneLow)
      ? input.bullZoneLow - half
      : null;
  const bearSl =
    input.bearZoneHigh != null && Number.isFinite(input.bearZoneHigh)
      ? input.bearZoneHigh + half
      : null;
  return { bullSl, bearSl, halfWidthUsd: half };
}

export interface ZoneTradeParams {
  side:           "BUY" | "SELL";
  entryPrice:     number;
  stopLoss:       number;
  tp1:            number;
  tp2:            number;
  tp3:            number;
  rDistance:      number;
  slDistancePct:  number;
}

/**
 * Compute SL / TP1 / TP2 / TP3 for a zone-bot trade entry. Pure helper —
 * also exported so the live-execution layer can reuse the exact same math
 * (avoiding any chance of drift between sim and live).
 */
export function computeZoneTradeParams(
  side:          "BUY" | "SELL",
  entryPrice:    number,
  bullZoneLow:   number | null,
  bearZoneHigh:  number | null,
  halfWidthUsd?: number | null,
  bandGeometry?: {
    bullZoneHigh?: number | null;
    bearZoneLow?: number | null;
  },
): ZoneTradeParams | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  const { bullSl, bearSl } = computeZoneSlAnchors({
    halfWidthUsd,
    bullZoneLow,
    bullZoneHigh: bandGeometry?.bullZoneHigh ?? null,
    bearZoneLow: bandGeometry?.bearZoneLow ?? null,
    bearZoneHigh,
  });

  if (side === "BUY") {
    if (bullSl == null) return null;
    const stopLoss  = bullSl;
    const rDistance = entryPrice - stopLoss;
    if (rDistance <= 0) return null; // SL not actually below entry — bail
    return {
      side,
      entryPrice,
      stopLoss,
      tp1: entryPrice + rDistance,
      tp2: entryPrice + 2 * rDistance,
      tp3: entryPrice + 3 * rDistance,
      rDistance,
      slDistancePct: rDistance / entryPrice,
    };
  } else {
    if (bearSl == null) return null;
    const stopLoss  = bearSl;
    const rDistance = stopLoss - entryPrice;
    if (rDistance <= 0) return null; // SL not above entry — bail
    return {
      side,
      entryPrice,
      stopLoss,
      tp1: entryPrice - rDistance,
      tp2: entryPrice - 2 * rDistance,
      tp3: entryPrice - 3 * rDistance,
      rDistance,
      slDistancePct: rDistance / entryPrice,
    };
  }
}

// ── Rolling-window confirmation (pure) ───────────────────────────────────

export interface ZoneConfirmationCheck {
  /** True when both gates pass: in-window AND no new lows/highs in 2nd half. */
  confirmed:   boolean;
  /** Approx minutes of in-window history evaluated (one sample ≈ one minute). */
  minutesHeld: number;
  /** Human-readable detail surfaced into `state.reason`. */
  detail:      string;
}

/**
 * Returns null when there isn't enough history to make a meaningful call
 * (cold start / first cron tick) — caller treats null as "still building
 * history, don't fire OPEN yet but don't reset the timer either".
 *
 * Mirrors the local `checkZoneConfirmation` in `heatmap-zones-settings.ts`
 * but takes `now` as an argument and lives in a shared module so the zone
 * bot doesn't pull in the pattern-bot module.
 */
export function checkZoneConfirmation(
  history:        PricePoint[],
  confirmMinutes: number,
  floor:          number,
  direction:      "BULL" | "BEAR",
  now:            number,
  /** Optional override for the noise tolerance applied to gate 1 (floor
   *  breach) and gate 2 (new lows / highs). Defaults to 7 bps of the
   *  floor price — see CONFIRMATION_NOISE_PCT_OF_SPOT above for the
   *  derivation. Tests pass 0 to get the legacy strict behaviour. */
  noiseFloorUsd?: number,
): ZoneConfirmationCheck | null {
  const windowMs = confirmMinutes * 60_000;
  const window   = history
    .filter((p) => now - p.ts <= windowMs)
    .sort((a, b) => a.ts - b.ts);

  // Need at least half the expected samples to make a meaningful call.
  // Below that we return null and the caller treats it as "not enough
  // data yet" rather than "failed confirmation".
  const minRequired = Math.max(3, Math.floor(confirmMinutes / 2));
  if (window.length < minRequired) return null;

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const minutesHeld = Math.round(window.length); // ≈ 1 sample / minute
  const noise = noiseFloorUsd ?? Math.abs(floor) * CONFIRMATION_NOISE_PCT_OF_SPOT;

  // Gate 1: zone floor / ceiling held, with a noise tolerance so that
  // single 1-sec wicks below the floor by < `noise` don't reset the
  // confirmation timer. A genuine break stays caught (wicks > noise).
  const heldFloor = direction === "BULL"
    ? window.every((p) => p.price >= floor - noise)
    : window.every((p) => p.price <= floor + noise);

  if (!heldFloor) {
    const worst = direction === "BULL"
      ? Math.min(...window.map((p) => p.price))
      : Math.max(...window.map((p) => p.price));
    return {
      confirmed: false,
      minutesHeld,
      detail: `zone ${direction === "BULL" ? "floor" : "ceiling"} broken — ${fmt(worst)} breached ${fmt(floor)} by > ${fmt(noise)}`,
    };
  }

  // Gate 2: no new lows (BULL) / no new highs (BEAR) in 2nd half vs 1st half.
  // Same noise tolerance — a few-dollar drift over a 15-min window is
  // normal and shouldn't count as "still drifting weaker".
  const half      = Math.floor(window.length / 2);
  const firstHalf = window.slice(0, half);
  const lastHalf  = window.slice(-half);

  if (direction === "BULL") {
    const minFirst = Math.min(...firstHalf.map((p) => p.price));
    const minLast  = Math.min(...lastHalf.map((p) => p.price));
    if (minLast < minFirst - noise) {
      return {
        confirmed: false,
        minutesHeld,
        detail: `still making lower lows (${fmt(minFirst)} → ${fmt(minLast)}, > ${fmt(noise)} drift)`,
      };
    }
  } else {
    const maxFirst = Math.max(...firstHalf.map((p) => p.price));
    const maxLast  = Math.max(...lastHalf.map((p) => p.price));
    if (maxLast > maxFirst + noise) {
      return {
        confirmed: false,
        minutesHeld,
        detail: `still making higher highs (${fmt(maxFirst)} → ${fmt(maxLast)}, > ${fmt(noise)} drift)`,
      };
    }
  }

  return {
    confirmed: true,
    minutesHeld,
    detail: `held ${confirmMinutes} min, no new ${direction === "BULL" ? "lows" : "highs"} (noise ±${fmt(noise)})`,
  };
}

// ── Helpers (pure, internal) ─────────────────────────────────────────────

function isStale(computedAt: string, now: number): boolean {
  const t = new Date(computedAt).getTime();
  if (!Number.isFinite(t) || t <= 0) return true;
  return now - t > SUGGESTED_STALE_MS;
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

interface ZonesView {
  hasBull:        boolean;
  hasBear:        boolean;
  priceInBull:    boolean;
  priceInBear:    boolean;
  bullZoneLow:    number | null;
  bullZoneHigh:   number | null;
  bullExitAbove:  number | null;
  bearZoneHigh:   number | null;
  bearZoneLow:    number | null;
  bearExitBelow:  number | null;
  maxPain:        number | null;
  halfWidthUsd:   number | null | undefined;
}

function deriveZones(spot: number, s: ZoneBotSuggestedZones): ZonesView {
  const hasBull = s.bullZoneLow != null && s.bullExitAbove != null;
  const hasBear = s.bearZoneHigh != null && s.bearExitBelow != null;

  return {
    hasBull,
    hasBear,
    priceInBull: hasBull &&
      spot >= (s.bullZoneLow   as number) &&
      spot <= (s.bullExitAbove as number),
    priceInBear: hasBear &&
      spot <= (s.bearZoneHigh  as number) &&
      spot >= (s.bearExitBelow as number),
    bullZoneLow:   s.bullZoneLow,
    bullZoneHigh:  s.bullZoneHigh ?? null,
    bullExitAbove: s.bullExitAbove,
    bearZoneHigh:  s.bearZoneHigh,
    bearZoneLow:   s.bearZoneLow ?? null,
    bearExitBelow: s.bearExitBelow,
    maxPain:       s.maxPain,
    halfWidthUsd:  s.halfWidthUsd,
  };
}

/** Returns a base copy of state with `updatedAt` left untouched (the
 *  save layer stamps it). Use this as the starting point for all mutations
 *  inside the engine so we never accidentally mutate the input. */
function cloneState(s: ZoneBotState): ZoneBotState {
  return {
    direction:        s.direction,
    confirming:       s.confirming ? { ...s.confirming } : null,
    openTradeId:      s.openTradeId,
    openLiveTradeIds: { ...s.openLiveTradeIds },
    lastFlipAt:       s.lastFlipAt,
    reason:           s.reason,
    priceHistory:     s.priceHistory.slice(),
    updatedAt:        s.updatedAt,
  };
}

// ── Main engine ──────────────────────────────────────────────────────────

export function evaluateZoneBot(input: EvaluateZoneBotInput): EvaluateZoneBotResult {
  const { spot, suggested, settings, state, history, now } = input;
  const next = cloneState(state);
  // The cron is responsible for appending the latest sample; we just store
  // the same history back so it round-trips cleanly.
  next.priceHistory = history;

  // ── 0. Master kill switch ──────────────────────────────────────────────
  if (settings.manualOverride === "OFF") {
    // Hold any open trade — its SL/TPs continue running. Just stop
    // initiating anything new and clear pending confirmation.
    next.direction  = state.openTradeId ? state.direction : "IDLE";
    next.confirming = null;
    next.reason     = "OFF — manual override";
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  // ── 1. No price feed ───────────────────────────────────────────────────
  if (spot == null || !Number.isFinite(spot)) {
    next.reason = "OFF — price feed unavailable";
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  // ── 2. No suggested zones (cold start / stale) ─────────────────────────
  if (suggested == null || isStale(suggested.computedAt, now)) {
    next.direction  = state.openTradeId ? state.direction : "IDLE";
    next.confirming = null;
    next.reason = suggested == null
      ? "OFF — no zones suggested yet (waiting for cron)"
      : "OFF — suggested zones stale (>12h), tap Refresh";
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  const zones = deriveZones(spot, suggested);

  // ── 3. State has an open trade — manage it ─────────────────────────────
  if (state.openTradeId != null) {
    const openSide   = state.direction === "BEAR" ? "SELL" : "BUY";
    const openSideLabel = state.direction === "BEAR" ? "BEAR" : "BULL";

    // (Max-pain proximity exit retired 2026-05-23. Open trades now ride
    //  to their own SL / TP / trailing-SL, applied by sync-simulator's
    //  universal lifecycle loop. The engine only decides flips below.)

    // 3a. Opposite side may be priming for a flip.
    const oppositeInZone = openSide === "BUY" ? zones.priceInBear : zones.priceInBull;
    if (oppositeInZone) {
      const oppositeDir: "BULL" | "BEAR" = openSide === "BUY" ? "BEAR" : "BULL";
      const oppositeFloor =
        oppositeDir === "BEAR" ? (zones.bearZoneHigh as number) : (zones.bullZoneLow as number);

      const check = checkZoneConfirmation(
        history,
        settings.zoneConfirmMinutes,
        oppositeFloor,
        oppositeDir,
        now,
        spot * CONFIRMATION_NOISE_PCT_OF_SPOT,
      );

      // Cold cache — hold both: trade stays open, confirmation primes.
      if (check == null) {
        next.confirming = {
          side:        oppositeDir,
          minutesHeld: 0,
          startedAt:   state.confirming?.side === oppositeDir
            ? state.confirming.startedAt
            : new Date(now).toISOString(),
        };
        next.reason = `${openSideLabel} ACTIVE — opposite ${oppositeDir} confirming, building history`;
        return { nextState: next, action: { type: "NONE", reason: next.reason } };
      }

      if (check.confirmed) {
        // FLIP: caller closes old trade, opens new one on opposite side.
        const newSide: "BUY" | "SELL" = oppositeDir === "BEAR" ? "SELL" : "BUY";
        const params = computeZoneTradeParams(
          newSide,
          spot,
          zones.bullZoneLow,
          zones.bearZoneHigh,
          zones.halfWidthUsd,
          {
            bullZoneHigh: zones.bullZoneHigh,
            bearZoneLow: zones.bearZoneLow,
          },
        );
        if (params && params.slDistancePct <= MAX_SL_DISTANCE_PCT) {
          if (!passesEntryPocRR(oppositeDir, newSide, spot, params.stopLoss, zones.maxPain)) {
            next.direction  = "IDLE";
            next.confirming = null;
            next.reason     = pocRRSkipReason(oppositeDir, newSide, spot, params.stopLoss, zones.maxPain);
            return { nextState: next, action: { type: "NONE", reason: next.reason } };
          }
          next.direction     = oppositeDir;
          next.confirming    = null;
          next.openTradeId   = null; // caller assigns the new trade id after creation
          next.lastFlipAt    = new Date(now).toISOString();
          next.reason = `FLIP ${openSideLabel}→${oppositeDir} — opposite zone confirmed`;
          return {
            nextState: next,
            action: {
              type:        "FLIP",
              closeReason: `flip to ${oppositeDir}`,
              openSide:    newSide,
              entryPrice:  params.entryPrice,
              stopLoss:    params.stopLoss,
              tp1:         params.tp1,
              tp2:         params.tp2,
              tp3:         params.tp3,
              rDistance:   params.rDistance,
              reason:      next.reason,
            },
          };
        }

        // SL too far for the new trade — just close the old one; don't
        // immediately re-open in a bad shape.
        next.direction   = "IDLE";
        next.confirming  = null;
        next.openTradeId = null;
        next.lastFlipAt  = new Date(now).toISOString();
        next.reason = `CLOSE ${openSideLabel} — opposite confirmed but SL distance ${
          params ? (params.slDistancePct * 100).toFixed(2) + "%" : "n/a"
        } > ${(MAX_SL_DISTANCE_PCT * 100).toFixed(1)}%`;
        return {
          nextState: next,
          action: { type: "CLOSE", reason: next.reason },
        };
      }

      // Opposite confirming but not yet confirmed — trade stays open.
      next.confirming = {
        side:        oppositeDir,
        minutesHeld: check.minutesHeld,
        startedAt:   state.confirming?.side === oppositeDir
          ? state.confirming.startedAt
          : new Date(now).toISOString(),
      };
      next.reason = `${openSideLabel} ACTIVE — opposite ${oppositeDir} confirming ` +
        `(${check.minutesHeld}/${settings.zoneConfirmMinutes} min) — ${check.detail}`;
      return { nextState: next, action: { type: "NONE", reason: next.reason } };
    }

    // 3b. Price is back inside the active side's zone, or somewhere
    //     between zones, or above bullExitAbove (happy trail). Trade keeps
    //     running on its trailing SL / TPs.
    next.confirming = null; // cancel any pending opposite confirmation
    if (zones.priceInBull && openSide === "BUY") {
      next.reason = `BULL ACTIVE — price ${fmtUsd(spot)} inside entry band`;
    } else if (zones.priceInBear && openSide === "SELL") {
      next.reason = `BEAR ACTIVE — price ${fmtUsd(spot)} inside entry band`;
    } else if (
      openSide === "BUY" &&
      zones.bullExitAbove != null && spot > zones.bullExitAbove
    ) {
      next.reason = `BULL ACTIVE — price ${fmtUsd(spot)} above zone, trailing SL handles exit`;
    } else if (
      openSide === "SELL" &&
      zones.bearExitBelow != null && spot < zones.bearExitBelow
    ) {
      next.reason = `BEAR ACTIVE — price ${fmtUsd(spot)} below zone, trailing SL handles exit`;
    } else {
      next.reason = `${openSideLabel} ACTIVE — price ${fmtUsd(spot)} between zones, trade holds`;
    }
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  // ── 4. No open trade — look for a fresh entry ──────────────────────────
  // Before evaluating zones, check the suggester's regime flags. Panic IV
  // or signal conflict suppresses fresh entries entirely. Existing trades
  // (handled above) are untouched — they manage themselves on SL/TPs.
  if (suggested.inPanicRegime || suggested.signalConflict) {
    next.direction  = "IDLE";
    next.confirming = null;
    next.reason = suggested.notActionableReason ??
      (suggested.inPanicRegime ? "Panic regime — entries suppressed"
                                : "Signal conflict — entries suppressed");
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  // BULL has priority arbitrarily when both sides are in entry (which
  // shouldn't happen with a >$2,500 gap, but be defensive).
  if (zones.priceInBull) {
    // Suggester-level actionable veto. When the field is undefined
    // (legacy doc), treat as permissive — we used to ignore this gate
    // entirely. When explicitly false, hold IDLE with the suggester's
    // own reason so the operator sees consistent state across UI + bot.
    if (suggested.bullActionable === false) {
      next.direction  = "IDLE";
      next.confirming = null;
      next.reason     = suggested.notActionableReason ?? "BULL zone present but not actionable";
      return { nextState: next, action: { type: "NONE", reason: next.reason } };
    }
    return tryOpen("BULL", spot, zones, settings, state, history, next, now);
  }
  if (zones.priceInBear) {
    if (suggested.bearActionable === false) {
      next.direction  = "IDLE";
      next.confirming = null;
      next.reason     = suggested.notActionableReason ?? "BEAR zone present but not actionable";
      return { nextState: next, action: { type: "NONE", reason: next.reason } };
    }
    return tryOpen("BEAR", spot, zones, settings, state, history, next, now);
  }

  // 5. Price outside every zone, no trade — fully idle.
  next.direction  = "IDLE";
  next.confirming = null;
  next.reason     = `IDLE — price ${fmtUsd(spot)} between zones`;
  return { nextState: next, action: { type: "NONE", reason: next.reason } };
}

// ── Fresh-entry helper ───────────────────────────────────────────────────

function tryOpen(
  side:     "BULL" | "BEAR",
  spot:     number,
  zones:    ZonesView,
  settings: ZoneBotSettings,
  state:    ZoneBotState,
  history:  PricePoint[],
  next:     ZoneBotState,
  now:      number,
): EvaluateZoneBotResult {
  const floor = side === "BULL"
    ? (zones.bullZoneLow as number)
    : (zones.bearZoneHigh as number);

  const check = checkZoneConfirmation(
    history,
    settings.zoneConfirmMinutes,
    floor,
    side,
    now,
    spot * CONFIRMATION_NOISE_PCT_OF_SPOT,
  );

  // Cold cache — start the confirmation timer, no trade yet.
  if (check == null) {
    next.direction  = "IDLE";
    next.confirming = {
      side,
      minutesHeld: 0,
      startedAt:   state.confirming?.side === side
        ? state.confirming.startedAt
        : new Date(now).toISOString(),
    };
    next.reason = `${side} confirming — building history`;
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  if (!check.confirmed) {
    next.direction  = "IDLE";
    next.confirming = {
      side,
      minutesHeld: check.minutesHeld,
      startedAt:   state.confirming?.side === side
        ? state.confirming.startedAt
        : new Date(now).toISOString(),
    };
    next.reason = `${side} confirming (${check.minutesHeld}/${settings.zoneConfirmMinutes} min) — ${check.detail}`;
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  // Confirmed — try to OPEN.
  const tradeSide: "BUY" | "SELL" = side === "BULL" ? "BUY" : "SELL";
  const params = computeZoneTradeParams(
    tradeSide,
    spot,
    zones.bullZoneLow,
    zones.bearZoneHigh,
    zones.halfWidthUsd,
    {
      bullZoneHigh: zones.bullZoneHigh,
      bearZoneLow: zones.bearZoneLow,
    },
  );

  if (!params) {
    // Defensive — shouldn't happen if priceInBull/priceInBear was true,
    // but bail cleanly rather than throwing.
    next.direction  = "IDLE";
    next.confirming = null;
    next.reason = `${side} confirmed but trade params could not be computed`;
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  if (params.slDistancePct > MAX_SL_DISTANCE_PCT) {
    // Stay IDLE so we re-evaluate every tick — if spot moves closer to
    // the zone floor, SL distance shrinks and we'll fire next tick.
    next.direction  = "IDLE";
    next.confirming = { side, minutesHeld: check.minutesHeld, startedAt: state.confirming?.startedAt ?? new Date(now).toISOString() };
    next.reason = `${side} confirmed but SL distance ${(params.slDistancePct * 100).toFixed(2)}% > ${(MAX_SL_DISTANCE_PCT * 100).toFixed(1)}% — skipping entry`;
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  if (!passesEntryPocRR(side, tradeSide, spot, params.stopLoss, zones.maxPain)) {
    next.direction  = "IDLE";
    next.confirming = {
      side,
      minutesHeld: check.minutesHeld,
      startedAt:   state.confirming?.startedAt ?? new Date(now).toISOString(),
    };
    next.reason = pocRRSkipReason(side, tradeSide, spot, params.stopLoss, zones.maxPain);
    return { nextState: next, action: { type: "NONE", reason: next.reason } };
  }

  next.direction     = side;
  next.confirming    = null;
  next.openTradeId   = null; // caller assigns after creating the trade
  next.lastFlipAt    = state.lastFlipAt;
  next.reason = `${side} ACTIVE — zone confirmed (${settings.zoneConfirmMinutes} min), opening trade`;
  return {
    nextState: next,
    action: {
      type:       "OPEN",
      side:       tradeSide,
      entryPrice: params.entryPrice,
      stopLoss:   params.stopLoss,
      tp1:        params.tp1,
      tp2:        params.tp2,
      tp3:        params.tp3,
      rDistance:  params.rDistance,
      reason:     next.reason,
    },
  };
}
