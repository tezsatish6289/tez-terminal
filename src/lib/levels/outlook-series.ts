import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { nseExpiryIstDateKey } from "@/lib/levels/zones-expiry-label";
import { istCalendarDateKey } from "@/lib/ist-display";

/**
 * Nifty Outlook — turns the per-expiry option-positioning slices (support /
 * resistance / max-pain) into a forward "map" anchored on calendar dates.
 *
 * This is NOT a fabricated forecast: every checkpoint is a real upcoming expiry
 * with its own derived bands. Confidence tiers exist because far-dated option
 * open interest is thin and shifts as traders roll, so the further out we look
 * the less the snapshot is likely to hold.
 */

export type OutlookConfidence = "high" | "medium" | "low";

export interface OutlookCheckpoint {
  expiryKey: string;
  /** Short axis label, e.g. `26 Jun`. */
  label: string;
  daysFromToday: number;
  supportLow: number | null;
  supportHigh: number | null;
  resistanceLow: number | null;
  resistanceHigh: number | null;
  maxPain: number | null;
  /** Dominant put-cluster open interest at support (contracts). */
  supportOI: number | null;
  /** Strike with the dominant put OI (support anchor). */
  supportStrike: number | null;
  /** Dominant call-cluster open interest at resistance (contracts). */
  resistanceOI: number | null;
  /** Strike with the dominant call OI (resistance anchor). */
  resistanceStrike: number | null;
  /** Change in support OI since prev close (+ reinforcing, − unwinding). */
  supportOIChange: number | null;
  /** Change in resistance OI since prev close (+ reinforcing, − unwinding). */
  resistanceOIChange: number | null;
  confidence: OutlookConfidence;
}

export interface OutlookSeries {
  spot: number | null;
  /** Synthetic "today" anchor carrying the nearest expiry's bands. */
  today: OutlookCheckpoint | null;
  checkpoints: OutlookCheckpoint[];
  /** Largest `daysFromToday` across checkpoints (x-axis extent). */
  horizonDays: number;
  priceMin: number;
  priceMax: number;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `YYYY-MM-DD` → whole-day epoch number (timezone-agnostic, comparison only). */
function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000);
}

function shortLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const day = Number(m[3]);
  const monIdx = Number(m[2]) - 1;
  return `${day} ${MONTH_ABBR[monIdx] ?? m[2]}`;
}

/** Nearest expiry is solid; everything after fades — the honest reliability story. */
function confidenceForIndex(i: number): OutlookConfidence {
  if (i <= 0) return "high";
  if (i === 1) return "medium";
  return "low";
}

export function buildOutlookSeries(
  levels: PublicLevels | null | undefined,
  spotOverride?: number | null,
  nowMs: number = Date.now(),
): OutlookSeries | null {
  const slices = levels?.zonesByExpiry ?? [];
  if (!levels || slices.length === 0) return null;

  const spot = spotOverride ?? levels.spot ?? null;
  const todayKey = istCalendarDateKey(nowMs);
  const todayNum = dayNumber(todayKey);

  const checkpoints: OutlookCheckpoint[] = [];
  let tierIndex = 0;
  for (const slice of slices) {
    const istKey = nseExpiryIstDateKey(slice.expiryKey);
    const expNum = istKey ? dayNumber(istKey) : null;
    if (istKey == null || expNum == null || todayNum == null) continue;
    const daysFromToday = Math.max(expNum - todayNum, 0);
    checkpoints.push({
      expiryKey: slice.expiryKey,
      label: shortLabel(istKey),
      daysFromToday,
      supportLow: slice.bullLow,
      supportHigh: slice.bullHigh,
      resistanceLow: slice.bearLow,
      resistanceHigh: slice.bearHigh,
      maxPain: slice.poc,
      supportOI: slice.putClusterSize,
      supportStrike: slice.putClusterStrike,
      resistanceOI: slice.callClusterSize,
      resistanceStrike: slice.callClusterStrike,
      supportOIChange: slice.putClusterChange,
      resistanceOIChange: slice.callClusterChange,
      confidence: confidenceForIndex(tierIndex),
    });
    tierIndex += 1;
  }

  if (checkpoints.length === 0) return null;
  checkpoints.sort((a, b) => a.daysFromToday - b.daysFromToday);

  const prices: number[] = [];
  if (spot != null) prices.push(spot);
  for (const cp of checkpoints) {
    for (const v of [cp.supportLow, cp.supportHigh, cp.resistanceLow, cp.resistanceHigh, cp.maxPain]) {
      if (v != null) prices.push(v);
    }
  }
  if (prices.length < 2) return null;

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = Math.max(maxP - minP, 1);
  const pad = span * 0.08;

  const nearest = checkpoints[0];
  const today: OutlookCheckpoint = {
    ...nearest,
    expiryKey: "__today__",
    label: "Today",
    daysFromToday: 0,
    confidence: "high",
  };

  const horizonDays = Math.max(checkpoints[checkpoints.length - 1].daysFromToday, 1);

  return {
    spot,
    today,
    checkpoints,
    horizonDays,
    priceMin: minP - pad,
    priceMax: maxP + pad,
  };
}

export function confidenceOpacity(c: OutlookConfidence): number {
  return c === "high" ? 1 : c === "medium" ? 0.62 : 0.36;
}

export function confidenceLabel(c: OutlookConfidence): string {
  return c === "high" ? "Confident" : c === "medium" ? "Softening" : "Speculative";
}
