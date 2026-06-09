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

/** Firestore doc in `sr_zone_events`. */
export interface SrZoneEvent {
  symbol: string;
  label: string;
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
  levelsSource: PublicLevelsSource | null;
  statusAtEntry: "IN_BULL" | "IN_BEAR";
  state: SrEventState;
  resolveReason?: SrResolveReason | null;
  closeComment?: string | null;
  resolvedAt?: string | null;
  maxFavorablePct?: number | null;
  maxAdversePct?: number | null;
  hitPoc?: boolean | null;
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
