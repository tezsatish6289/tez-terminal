/** FreedomBot / TezTerminal dashboard line & area curves (stats + performance). */
export const BRAND_CURVE_STROKE = "#60a5fa";
export const BRAND_CURVE_FILL_OPACITY = { top: 0.32, bottom: 0 } as const;
/** Dimmed blue for negative daily P&L bars (keeps branding without green/red). */
export const BRAND_CURVE_MUTED = "rgba(96,165,250,0.42)";

/** Tailwind classes for headline KPIs and ratio tiles (#60a5fa ≈ blue-400). */
export const BRAND_METRIC_POSITIVE = "text-blue-400";
export const BRAND_METRIC_NEGATIVE = "text-rose-400";
export const BRAND_LIVE_BADGE = "bg-blue-500/15 text-blue-400";

export function brandMetricColor(positive: boolean): string {
  return positive ? BRAND_METRIC_POSITIVE : BRAND_METRIC_NEGATIVE;
}
