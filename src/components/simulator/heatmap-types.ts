/** Shared types for Deribit zone heatmap cards (simulation grid + BTC sheet). */

export interface MaxPainEntry {
  expiry: string;
  maxPain: number;
  totalOI: number;
  dayIndex: number;
}

export interface SuggestedZonesSnapshot {
  bullStrike: number | null;
  bearStrike: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bullExitAbove: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  bearExitBelow: number | null;
  bullOI: number | null;
  bearOI: number | null;
  maxPain: number | null;
  maxPainByExpiry: MaxPainEntry[] | null;
  signalConflict: boolean | null;
  bullTpTarget: number | null;
  bullTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  bearTpTarget: number | null;
  bearTpConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  atmIV?: number | null;
  inPanicRegime?: boolean | null;
  halfWidthUsd?: number | null;
  maxReachUsd?: number | null;
  bullActionable?: boolean | null;
  bearActionable?: boolean | null;
  notActionableReason?: string | null;
  insufficientGap?: boolean | null;
  btcPrice?: number | null;
  deribitIndexPrice?: number | null;
  computedAt?: string;
}

export function spotFromSuggested(s: SuggestedZonesSnapshot | null): number | null {
  if (!s) return null;
  return s.deribitIndexPrice ?? s.btcPrice ?? null;
}

export function formatSpot(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function zoneStatusLine(s: SuggestedZonesSnapshot | null): string {
  if (!s) return "No zone data — refresh";
  if (s.signalConflict) return "Signal conflict";
  if (s.insufficientGap) return "Zones too close";
  if (s.inPanicRegime) return "Panic regime";
  if (s.bullActionable && s.bearActionable) return "Bull & bear active";
  if (s.bullActionable) return "Bull zone active";
  if (s.bearActionable) return "Bear zone active";
  const short = s.notActionableReason?.match(/^TP room (\$[\d,]+)/)?.[1];
  if (short) return `Idle · TP room ${short}`;
  if (s.notActionableReason?.startsWith("No big cluster")) return "No cluster in reach";
  return "Idle";
}
