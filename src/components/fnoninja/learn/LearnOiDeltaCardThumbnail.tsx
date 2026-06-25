"use client";

import { Loader2 } from "lucide-react";
import { FnoNinjaOiDeltaLiveVisual } from "@/components/fnoninja/learn/FnoNinjaOiDeltaLiveVisual";
import { useLearnNiftyLiveData } from "@/lib/fnoninja/use-learn-nifty-live-data";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

/** Live NIFTY chart preview for the OI delta Learn hub card. */
export function LearnOiDeltaCardThumbnail({ accent }: { accent: string }) {
  const { levels, candles, loading, candlesLoading } = useLearnNiftyLiveData();

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden"
      style={{ background: accent }}
    >
      <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
          </div>
        ) : (
          <FnoNinjaOiDeltaLiveVisual
            levels={levels}
            loading={loading}
            candles={candles}
            candlesLoading={candlesLoading}
            compact
          />
        )}
      </div>
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-2.5 py-1.5 pointer-events-none z-10"
        style={{ background: "linear-gradient(to bottom, rgba(8,15,30,0.75), transparent)" }}
      >
        <span className="text-[10px] font-black text-white tracking-wide">NIFTY</span>
        <span
          className="text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5"
          style={{ backgroundColor: "rgba(251,191,36,0.2)", color: "#fcd34d" }}
        >
          Live Δ OI
        </span>
      </div>
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{ background: "linear-gradient(to top, rgba(8,15,30,0.88) 0%, transparent 40%)" }}
      />
    </div>
  );
}
