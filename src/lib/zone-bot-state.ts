/**
 * Zone Bot — per-asset runtime state.
 *
 * Persisted at `config/zone_bot_${asset}_state`. Written by the
 * `sync-zone-bots` cron each tick; read by the UI to render the bot
 * status line and by the cron itself on the next tick to evaluate
 * confirmation windows.
 *
 * See `docs/zone-bots.md` §3 for the state machine diagram.
 */
import type { Firestore } from "firebase-admin/firestore";
import type { ZoneBotAsset } from "./zone-bot-config";

// ── Types ────────────────────────────────────────────────────────────────

export type ZoneBotDirection = "BULL" | "BEAR" | "IDLE";

export interface PricePoint {
  /** Spot price of the asset at sample time. */
  price: number;
  /** Unix ms. */
  ts: number;
}

/** In-flight confirmation tracker. `null` when no side is currently
 *  proving itself (either ACTIVE or completely IDLE). */
export interface ZoneConfirmation {
  side: "BULL" | "BEAR";
  /** Minutes the side has been confirming so far (clamped to window). */
  minutesHeld: number;
  /** ISO timestamp of the first confirming sample. */
  startedAt: string;
}

/** Live trade tracker keyed by userId so the cron can close per-user. */
export type LiveTradeIdMap = Record<string, string>;

export interface ZoneBotState {
  /** Current active direction. `IDLE` when neither side is fully confirmed. */
  direction: ZoneBotDirection;
  /** Side currently inside its confirmation window (if any). */
  confirming: ZoneConfirmation | null;
  /** Open `simulator_trades` doc id (if any). One trade at a time per bot. */
  openTradeId: string | null;
  /** Open `live_trades` doc id per user (if any). */
  openLiveTradeIds: LiveTradeIdMap;
  /** ISO timestamp of the last BULL↔BEAR flip. Used for UI + diagnostics. */
  lastFlipAt: string | null;
  /** Human-readable status string surfaced to the UI. */
  reason: string;
  /** Rolling window of spot samples — feeds the confirmation check. */
  priceHistory: PricePoint[];
  /** Last write time. */
  updatedAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────

/** Cap on rolling price-history samples kept per bot.
 *  Designed for a 15-min cron + up to 60-min confirmation window — keeps
 *  enough history to satisfy any in-range confirmMinutes setting plus
 *  some buffer, without unbounded doc growth. */
export const ZONE_BOT_PRICE_HISTORY_MAX = 80;

// ── Firestore paths ──────────────────────────────────────────────────────

export function zoneBotStateDoc(asset: ZoneBotAsset): string {
  return `config/zone_bot_${asset}_state`;
}

// ── Defaults / construction ──────────────────────────────────────────────

export function emptyZoneBotState(): ZoneBotState {
  return {
    direction:        "IDLE",
    confirming:       null,
    openTradeId:      null,
    openLiveTradeIds: {},
    lastFlipAt:       null,
    reason:           "no zones loaded yet",
    priceHistory:     [],
    updatedAt:        new Date().toISOString(),
  };
}

// ── Parsing ──────────────────────────────────────────────────────────────

const VALID_DIRECTIONS: ZoneBotDirection[] = ["BULL", "BEAR", "IDLE"];

/**
 * Parse a state document, applying empty-state defaults for any missing or
 * malformed fields. Never throws — bad input produces a clean empty state.
 */
export function parseZoneBotState(
  data: Record<string, unknown> | null | undefined,
): ZoneBotState {
  if (!data) return emptyZoneBotState();
  const empty = emptyZoneBotState();

  const direction =
    typeof data.direction === "string" &&
    VALID_DIRECTIONS.includes(data.direction as ZoneBotDirection)
      ? (data.direction as ZoneBotDirection)
      : empty.direction;

  // confirming: shape-validate or drop
  let confirming: ZoneConfirmation | null = null;
  if (data.confirming && typeof data.confirming === "object") {
    const c = data.confirming as Record<string, unknown>;
    if (
      (c.side === "BULL" || c.side === "BEAR") &&
      typeof c.minutesHeld === "number" &&
      typeof c.startedAt === "string"
    ) {
      confirming = {
        side: c.side,
        minutesHeld: Math.max(0, c.minutesHeld),
        startedAt: c.startedAt,
      };
    }
  }

  const openTradeId =
    typeof data.openTradeId === "string" && data.openTradeId.length > 0
      ? data.openTradeId
      : null;

  // openLiveTradeIds: { userId: tradeId } map; keep only string→string entries
  const openLiveTradeIds: LiveTradeIdMap = {};
  if (data.openLiveTradeIds && typeof data.openLiveTradeIds === "object") {
    for (const [k, v] of Object.entries(data.openLiveTradeIds as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0) openLiveTradeIds[k] = v;
    }
  }

  const lastFlipAt =
    typeof data.lastFlipAt === "string" && data.lastFlipAt.length > 0
      ? data.lastFlipAt
      : null;

  const reason = typeof data.reason === "string" ? data.reason : empty.reason;

  const priceHistory: PricePoint[] = Array.isArray(data.priceHistory)
    ? (data.priceHistory as unknown[]).filter(
        (p): p is PricePoint =>
          !!p &&
          typeof p === "object" &&
          typeof (p as PricePoint).price === "number" &&
          typeof (p as PricePoint).ts === "number",
      )
    : [];

  const updatedAt =
    typeof data.updatedAt === "string" && data.updatedAt.length > 0
      ? data.updatedAt
      : empty.updatedAt;

  return {
    direction,
    confirming,
    openTradeId,
    openLiveTradeIds,
    lastFlipAt,
    reason,
    priceHistory,
    updatedAt,
  };
}

// ── Price-history helpers ────────────────────────────────────────────────

/**
 * Append the latest spot sample to a price-history window, capping length
 * so the Firestore doc doesn't grow unbounded.
 *
 * Pure function — does NOT mutate the input array.
 */
export function appendZoneBotPriceHistory(
  existing: PricePoint[],
  spot: number | null,
  now: number = Date.now(),
  maxEntries: number = ZONE_BOT_PRICE_HISTORY_MAX,
): PricePoint[] {
  if (spot === null || !Number.isFinite(spot)) return existing.slice(-maxEntries);
  const next = [...existing, { price: spot, ts: now }];
  return next.length > maxEntries ? next.slice(-maxEntries) : next;
}

// ── Loaders / writers (Firestore Admin) ──────────────────────────────────

export async function loadZoneBotState(
  db: Firestore,
  asset: ZoneBotAsset,
): Promise<ZoneBotState> {
  try {
    const snap = await db.doc(zoneBotStateDoc(asset)).get();
    return parseZoneBotState(snap.exists ? (snap.data() ?? null) : null);
  } catch {
    return emptyZoneBotState();
  }
}

export async function saveZoneBotState(
  db: Firestore,
  asset: ZoneBotAsset,
  state: ZoneBotState,
): Promise<void> {
  // Always stamp updatedAt server-side so writers don't have to remember.
  await db.doc(zoneBotStateDoc(asset)).set(
    { ...state, updatedAt: new Date().toISOString() },
    { merge: false }, // full replace — state is small + structured
  );
}
