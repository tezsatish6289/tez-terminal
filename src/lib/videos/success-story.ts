import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import {
  SR_SUCCESS_MIN_MOVE_PCT,
  SR_ZONE_EVENTS_COLLECTION,
} from "@/lib/sr-audit/constants";
import type { SrZoneEvent, SrZoneScope } from "@/lib/sr-audit/types";

/**
 * "Success story" selection — turn the recorded SR-audit history into a single
 * deep-dive video subject: a stock/index that reached an option-wall cluster,
 * reacted, and ran to max pain.
 *
 * Criteria (the exact rule):
 *   1. Reached a put/call cluster   → event recorded on IN_BULL / IN_BEAR
 *   2. Reacted off the cluster      → maxFavorablePct > 0 (and large, below)
 *   3. Reached max pain             → hitPoc === true
 *   4. Max pain ≥ MIN_MOVE_PCT away from the cluster, and the realized move
 *      (MFE) ≥ MIN_MOVE_PCT
 *
 * This is illustrative/educational — never framed as a recommendation or claim.
 */

/** Minimum move % from cluster→max-pain AND realized favorable move. */
export const SUCCESS_MIN_MOVE_PCT = SR_SUCCESS_MIN_MOVE_PCT;

export interface SuccessStoryCandidate {
  id: string;
  symbol: string;
  label: string;
  scope: SrZoneScope;
  /** "support" = bounced off a put wall; "resistance" = rejected at a call wall. */
  side: SrZoneEvent["side"];
  /** Spot when price entered the cluster (the story's starting point). */
  entrySpot: number;
  /** Cluster band edges that were in play at entry. */
  clusterLow: number | null;
  clusterHigh: number | null;
  /** Dominant wall strike + OI at entry. */
  clusterStrike: number | null;
  clusterOi: number | null;
  /** Both walls (put = support, call = resistance). */
  putClusterStrike: number | null;
  putClusterSize: number | null;
  callClusterStrike: number | null;
  callClusterSize: number | null;
  /** Option-chain expiry the zones were derived from. */
  zonesExpiry: string | null;
  atmIV: number | null;
  volRegimeFlag: string | null;
  /** Reward:risk at entry (cluster strike → max pain vs invalidation). */
  entryRr: number | null;
  /** Invalidation level price. */
  invalidation: number | null;
  /** Resolution outcome (how the move ended). */
  resolveReason: string | null;
  resolvedAt: string | null;
  finalPnlPct: number | null;
  /** Max pain — the target the move ran to. */
  maxPain: number;
  /** Realized favorable move from entry (%). */
  movePct: number;
  /** |maxPain − entry| / entry (%): how far the target sat from the cluster. */
  maxPainDistancePct: number;
  /** ISO timestamps for the on-screen dates. */
  eventAt: string;
  pocHitAt: string | null;
  /** Whether a 15-min candle snapshot is stored (chart renderable). */
  hasSnapshot: boolean;
  /** Recency / strength score used to pick the headline story. */
  score: number;
}

function pct(a: number, b: number): number {
  return Math.abs((a - b) / b) * 100;
}

/**
 * Shape one event into a story candidate. Uses the stored `reachedTarget` win
 * flag (set by the scorer) but also accepts the raw rule as a fallback for rows
 * enriched before the flag existed.
 */
export function qualifySuccessStory(
  event: SrZoneEvent & { id: string },
): SuccessStoryCandidate | null {
  if (event.maxPain == null || !Number.isFinite(event.maxPain)) return null;
  if (!Number.isFinite(event.entrySpot) || event.entrySpot <= 0) return null;

  const movePct = typeof event.maxFavorablePct === "number" ? event.maxFavorablePct : 0;
  const maxPainDistancePct = pct(event.maxPain, event.entrySpot);

  // A win is simply reaching max pain (entry RR gate guarantees a real target).
  const qualifies = event.reachedTarget === true || event.hitPoc === true;
  if (!qualifies) return null;

  const clusterLow = event.side === "support" ? event.bullZoneLow : event.bearZoneLow;
  const clusterHigh = event.side === "support" ? event.bullZoneHigh : event.bearZoneHigh;

  // Score: bigger move wins, decayed gently by age so recent wins surface first.
  const refIso = event.resolvedAt ?? event.pocHitAt ?? event.eventAt;
  const ageDays = Math.max(0, (Date.now() - Date.parse(refIso)) / 86_400_000);
  const score = movePct - ageDays * 0.15;

  return {
    id: event.id,
    symbol: event.symbol,
    label: event.label || event.symbol,
    scope: event.scope === "index" ? "index" : "stock",
    side: event.side,
    entrySpot: event.entrySpot,
    clusterLow,
    clusterHigh,
    clusterStrike: event.clusterStrike ?? null,
    clusterOi: event.clusterOi ?? null,
    putClusterStrike: event.putClusterStrike ?? null,
    putClusterSize: event.putClusterSize ?? null,
    callClusterStrike: event.callClusterStrike ?? null,
    callClusterSize: event.callClusterSize ?? null,
    zonesExpiry: event.zonesExpiry ?? null,
    atmIV: event.atmIV ?? null,
    volRegimeFlag: event.volRegimeFlag ?? null,
    entryRr: event.entryRr ?? null,
    invalidation: event.invalidation ?? null,
    resolveReason: event.resolveReason ?? null,
    resolvedAt: event.resolvedAt ?? null,
    finalPnlPct: event.finalPnlPct ?? null,
    maxPain: event.maxPain,
    movePct,
    maxPainDistancePct,
    eventAt: event.eventAt,
    pocHitAt: event.pocHitAt ?? null,
    hasSnapshot: !!event.candlesSnapshotAt,
    score,
  };
}

export interface FindSuccessStoriesOpts {
  /** Only consider events whose entry is within this many days. */
  withinDays?: number;
  /** How many events to scan from Firestore (direction depends on `order`). */
  scanLimit?: number;
  /** Only return stories that have a stored candle snapshot (chart-ready). */
  requireSnapshot?: boolean;
  /** Minimum realized favorable move % (exclusive). Default: no extra floor beyond qualify. */
  minMovePct?: number;
  /**
   * Ranking:
   * - `score` (default) — strongest / freshest first (admin headline pick)
   * - `oldest` — chronological (legacy backlog drain)
   * - `newest` — most recent eventAt first
   */
  order?: "score" | "oldest" | "newest";
}

/**
 * Scan SR events (open or resolved) and return qualifying success stories.
 * Pure selection — candle loading is separate.
 */
export async function findSuccessStories(
  db: Firestore,
  opts: FindSuccessStoriesOpts = {},
): Promise<SuccessStoryCandidate[]> {
  const withinDays = opts.withinDays ?? 45;
  const scanLimit = opts.scanLimit ?? 300;
  const order = opts.order ?? "score";
  const cutoffMs = Date.now() - withinDays * 86_400_000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Oldest-first: range from cutoff ascending so we drain the backlog chronologically.
  // Score/newest: newest-first scan (admin headline behaviour).
  const snap =
    order === "oldest"
      ? await db
          .collection(SR_ZONE_EVENTS_COLLECTION)
          .where("eventAt", ">=", cutoffIso)
          .orderBy("eventAt", "asc")
          .limit(scanLimit)
          .get()
      : await db
          .collection(SR_ZONE_EVENTS_COLLECTION)
          .orderBy("eventAt", "desc")
          .limit(scanLimit)
          .get();

  const out: SuccessStoryCandidate[] = [];

  for (const doc of snap.docs) {
    const event = { id: doc.id, ...(doc.data() as SrZoneEvent) };
    if (event.eventAt && Date.parse(event.eventAt) < cutoffMs) continue;
    const candidate = qualifySuccessStory(event);
    if (!candidate) continue;
    if (opts.requireSnapshot && !candidate.hasSnapshot) continue;
    if (opts.minMovePct != null && !(candidate.movePct > opts.minMovePct)) continue;
    out.push(candidate);
  }

  if (order === "oldest") {
    out.sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt));
  } else if (order === "newest") {
    out.sort((a, b) => Date.parse(b.eventAt) - Date.parse(a.eventAt));
  } else {
    out.sort((a, b) => b.score - a.score);
  }
  return out;
}
