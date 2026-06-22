"use client";

/** Subtle on-chart branding — visible while trading and in share screenshots. */
export function LevelsChartBrandWatermark() {
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-2 z-[14] flex items-center gap-1.5 rounded-md px-1.5 py-1"
      style={{
        background: "rgba(7, 13, 26, 0.55)",
        border: "1px solid rgba(96, 165, 250, 0.2)",
      }}
      aria-hidden
    >
      <img src="/fnoninja/icon.svg" alt="" className="h-3.5 w-3.5 shrink-0" />
      <span
        className="text-[8px] font-black uppercase tracking-[0.18em] leading-none"
        style={{ color: "rgba(148, 163, 184, 0.85)" }}
      >
        FNONINJA
      </span>
    </div>
  );
}
