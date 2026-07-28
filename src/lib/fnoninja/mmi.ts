/** Tickertape Market Mood Index (0–100). */

export const MMI_TICKERTAPE_URL = "https://www.tickertape.in/market-mood-index";
export const MMI_BUBBLE_ID = "mmi";

export type MmiZone = "extreme_fear" | "fear" | "greed" | "extreme_greed";

export interface MmiSnapshot {
  value: number;
  updatedAt: string | null;
  zone: MmiZone;
}

export const MMI_ZONE_META: Record<
  MmiZone,
  { label: string; short: string; color: string; min: number; max: number }
> = {
  extreme_fear: {
    label: "Extreme Fear",
    short: "EXTREME FEAR",
    color: "#22c55e",
    min: 0,
    max: 30,
  },
  fear: {
    label: "Fear",
    short: "FEAR",
    color: "#f59e0b",
    min: 30,
    max: 50,
  },
  greed: {
    label: "Greed",
    short: "GREED",
    color: "#f97316",
    min: 50,
    max: 70,
  },
  extreme_greed: {
    label: "Extreme Greed",
    short: "EXTREME GREED",
    color: "#ef4444",
    min: 70,
    max: 100,
  },
};

export function mmiZoneForValue(value: number): MmiZone {
  if (value < 30) return "extreme_fear";
  if (value < 50) return "fear";
  if (value < 70) return "greed";
  return "extreme_greed";
}

export function formatMmiValue(value: number): string {
  return value.toFixed(2);
}

/** Relative "Updated N minutes ago" — Tickertape-style. */
export function formatMmiUpdatedAgo(updatedAt: string | null, nowMs = Date.now()): string {
  if (!updatedAt) return "Updated recently";
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return "Updated recently";
  const mins = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 minute ago";
  if (mins < 60) return `Updated ${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return "Updated 1 hour ago";
  return `Updated ${hrs} hours ago`;
}

export function isMmiBubbleId(id: string): boolean {
  return id === MMI_BUBBLE_ID;
}

export function formatMmiAria(mmi: MmiSnapshot): string {
  return `${formatMmiValue(mmi.value)}, ${MMI_ZONE_META[mmi.zone].label}`;
}
