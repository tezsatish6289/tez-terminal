import type { VolRegimeFlag } from "@/lib/zones/vol-regime";

/**
 * Volatility-regime chip shown next to a support/resistance setup. Pure display —
 * it never hides or filters a setup, it only annotates the risk around it:
 *   • Calm IV   — IV in its normal range
 *   • High IV   — elevated IV / term-structure inversion (no scheduled event)
 *   • Earnings ~Nd — a results announcement is near (event-driven IV ramp)
 * Renders nothing for UNKNOWN / missing regime.
 */
const STYLES: Record<
  Exclude<VolRegimeFlag, "UNKNOWN">,
  { label: string; className: string }
> = {
  CALM: {
    label: "Calm IV",
    className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200/90",
  },
  ELEVATED: {
    label: "High IV",
    className: "border-amber-400/30 bg-amber-500/15 text-amber-200",
  },
  EARNINGS: {
    label: "Earnings",
    className: "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200",
  },
};

export function VolRegimeBadge({
  flag,
  reason,
  atmIV,
  daysToEarnings,
  className = "",
}: {
  flag?: VolRegimeFlag | null;
  reason?: string | null;
  atmIV?: number | null;
  daysToEarnings?: number | null;
  className?: string;
}) {
  if (!flag || flag === "UNKNOWN") return null;
  const style = STYLES[flag];

  let label = style.label;
  if (flag === "EARNINGS" && typeof daysToEarnings === "number" && daysToEarnings >= 0) {
    label = `Earnings ~${daysToEarnings}d`;
  }

  const title =
    reason ??
    (typeof atmIV === "number" && Number.isFinite(atmIV)
      ? `ATM IV ${atmIV.toFixed(1)}%`
      : undefined);

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none tracking-wide ${style.className} ${className}`}
    >
      {label}
    </span>
  );
}
