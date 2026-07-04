"use client";

/** Top-left chart badge — clarifies candle timeframe for the active tab. */
export function LevelsChartCandleTypeBadge({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute top-2 left-2 z-[14] rounded-md px-2 py-1"
      style={{
        background: "rgba(7, 13, 26, 0.55)",
        border: "1px solid rgba(148, 163, 184, 0.22)",
      }}
      aria-hidden
    >
      <span
        className="text-[9px] font-semibold tracking-wide leading-none"
        style={{ color: "#94a3b8" }}
      >
        {label}
      </span>
    </div>
  );
}
