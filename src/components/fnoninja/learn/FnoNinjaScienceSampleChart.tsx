import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";

/** Static annotated NIFTY example — illustrative levels for the science guide. */
export function FnoNinjaScienceSampleChart() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid rgba(90,140,220,0.2)",
        backgroundColor: "rgba(0,0,0,0.45)",
      }}
    >
      <div
        className="px-3 py-2 border-b flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px]"
        style={{ borderColor: "rgba(90,140,220,0.12)", color: "#94a3b8" }}
      >
        <span className="font-black text-white text-sm">NIFTY</span>
        <span>Nifty 50</span>
        <span className="uppercase tracking-wider font-bold" style={{ color: "#64748b" }}>
          15m · NSE
        </span>
      </div>

      <div className="relative h-[280px] sm:h-[320px] px-2 sm:px-4 py-3">
        {/* Price rails (illustrative) */}
        <div className="absolute left-2 sm:left-4 top-3 bottom-3 w-px" style={{ backgroundColor: "rgba(100,116,139,0.25)" }} />
        <div className="absolute right-14 sm:right-16 top-3 bottom-3 w-px" style={{ backgroundColor: "rgba(100,116,139,0.25)" }} />

        {/* Bear band */}
        <div
          className="absolute left-8 sm:left-12 right-20 sm:right-24 rounded-sm"
          style={{
            top: "12%",
            height: "18%",
            background: `linear-gradient(180deg, ${LEVELS_ZONE_CHART.bear.nativeBandTop}, ${LEVELS_ZONE_CHART.bear.nativeBandBottom})`,
          }}
        />
        {/* Bull band */}
        <div
          className="absolute left-8 sm:left-12 right-20 sm:right-24 rounded-sm"
          style={{
            top: "58%",
            height: "18%",
            background: `linear-gradient(180deg, ${LEVELS_ZONE_CHART.bull.nativeBandTop}, ${LEVELS_ZONE_CHART.bull.nativeBandBottom})`,
          }}
        />

        {/* Call OI peak line */}
        <div
          className="absolute left-8 sm:left-12 right-20 sm:right-24 border-t border-dotted"
          style={{ top: "28%", borderColor: LEVELS_ZONE_CHART.bear.line }}
        />
        {/* Max pain */}
        <div
          className="absolute left-8 sm:left-12 right-20 sm:right-24 border-t border-dashed"
          style={{ top: "46%", borderColor: LEVELS_ZONE_CHART.maxPain.line }}
        />
        {/* Put OI peak */}
        <div
          className="absolute left-8 sm:left-12 right-20 sm:right-24 border-t border-dotted"
          style={{ top: "64%", borderColor: LEVELS_ZONE_CHART.bull.line }}
        />

        {/* Simplified candles */}
        <div className="absolute left-10 sm:left-14 right-24 sm:right-28 bottom-8 top-8 flex items-end gap-[3px] sm:gap-1">
          {[42, 55, 48, 62, 58, 70, 65, 72, 68, 75, 71, 78].map((h, i) => (
            <div
              key={i}
              className="flex-1 min-w-0 rounded-sm"
              style={{
                height: `${h}%`,
                backgroundColor: i % 3 === 0 ? "#ef4444" : "#22c55e",
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        {/* Labels */}
        <div
          className="absolute left-10 sm:left-14 max-w-[14rem] rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold"
          style={{
            top: "20%",
            color: "#fcd34d",
            backgroundColor: "rgba(8,15,30,0.75)",
          }}
        >
          Call OI peak — 890k @ 24,800
        </div>
        <div
          className="absolute left-10 sm:left-14 max-w-[14rem] rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold"
          style={{
            top: "40%",
            color: LEVELS_ZONE_CHART.maxPain.labelText,
            backgroundColor: "rgba(8,15,30,0.75)",
          }}
        >
          Max Pain · 27-Jun-2026 Expiry
        </div>
        <div
          className="absolute left-10 sm:left-14 max-w-[14rem] rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold"
          style={{
            top: "56%",
            color: "#fcd34d",
            backgroundColor: "rgba(8,15,30,0.75)",
          }}
        >
          Put OI peak — 1.2M @ 24,000
        </div>

        {/* Y-axis hints */}
        <div className="absolute right-2 sm:right-3 top-[26%] text-[9px] font-mono" style={{ color: "#94a3b8" }}>
          24,800
        </div>
        <div className="absolute right-2 sm:right-3 top-[44%] text-[9px] font-mono" style={{ color: LEVELS_ZONE_CHART.maxPain.labelText }}>
          24,500
        </div>
        <div className="absolute right-2 sm:right-3 top-[62%] text-[9px] font-mono" style={{ color: "#94a3b8" }}>
          24,000
        </div>
      </div>

      <p
        className="px-3 py-2 text-[10px] sm:text-[11px] border-t leading-relaxed"
        style={{ borderColor: "rgba(90,140,220,0.12)", color: "#64748b" }}
      >
        Sample illustration for learning — levels and OI counts are representative, not live quotes.
        Cross-check the strike and contract count on NSE for the listed expiry.
      </p>
    </div>
  );
}
