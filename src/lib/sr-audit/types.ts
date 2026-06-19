import type { PublicLevelsSource } from "@/lib/levels/levels-source";

export type SrZoneSide = "support" | "resistance";

export type SrEventState = "open" | "resolved" | "failed";

export type SrResolveReason =
  | "invalidation"
  | "zone_flip"
  /** @deprecated Legacy close reason — kept for existing Firestore rows. */
  | "left_zone"
  /** @deprecated Legacy close reason — kept for existing Firestore rows. */
  | "timeout";

export type SrEntryKind = "at" | "near";

/** Instrument class — equities vs NSE indices. Legacy rows are stocks. */
export type SrZoneScope = "stock" | "index";

/** Firestore doc in `sr_zone_events`. */
export interface SrZoneEvent {
  symbol: string;
  label: string;
  /** Instrument class. Absent on legacy rows → treat as "stock". */
  scope?: SrZoneScope;
  side: SrZoneSide;
  entryKind: SrEntryKind;
  eventAt: string;
  entrySpot: number;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  halfWidth: number | null;
  invalidation: number | null;
  maxPain: number | null;
  /** Dominant wall on the active side at entry — strike + OI (contracts). */
  clusterStrike?: number | null;
  clusterOi?: number | null;
  /** Both walls at entry (full chart context) — put = support, call = resistance. */
  putClusterStrike?: number | null;
  putClusterSize?: number | null;
  callClusterStrike?: number | null;
  callClusterSize?: number | null;
  /** Option-chain expiry the zones were derived from (DD/MM/YYYY). */
  zonesExpiry?: string | null;
  /** ATM IV + vol regime at entry (for the chart badge). */
  atmIV?: number | null;
  volRegimeFlag?: string | null;
  /** Reward:risk on the active side at entry (cluster strike → max pain vs invalidation). */
  entryRr?: number | null;
  levelsSource: PublicLevelsSource | null;
  statusAtEntry: "IN_BULL" | "IN_BEAR";
  state: SrEventState;
  resolveReason?: SrResolveReason | null;
  closeComment?: string | null;
  resolvedAt?: string | null;
  /** Cumulative running max — never lowered once set (see scoreOpenSrZoneEvents). */
  maxFavorablePct?: number | null;
  maxAdversePct?: number | null;
  /** Sticky: once price reaches max pain it stays true. */
  hitPoc?: boolean | null;
  /** First time price reached max pain, and the favorable ▲% at that bar. */
  pocHitAt?: string | null;
  pocHitPct?: number | null;
  /** Clean, selectable win flag for success-story videos (hit max pain + meaningful move). */
  reachedTarget?: boolean | null;
  /** ISO of the last 15-min candle snapshot write into sr_zone_event_candles. */
  candlesSnapshotAt?: string | null;
  currentSpot?: number | null;
  currentPnlPct?: number | null;
  finalPnlPct?: number | null;
  lastScoredAt?: string | null;
  scoreError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SrAuditSummary {
  total: number;
  open: number;
  resolved: number;
  failed: number;
  support: {
    count: number;
    resolved: number;
    invalidationRate: number | null;
    zoneFlipRate: number | null;
    medianMfePct: number | null;
    medianMaePct: number | null;
    pocHitRate: number | null;
  };
  resistance: {
    count: number;
    resolved: number;
    invalidationRate: number | null;
    zoneFlipRate: number | null;
    medianMfePct: number | null;
    medianMaePct: number | null;
    pocHitRate: number | null;
  };
  lastOutcomeCronAt: string | null;
}
