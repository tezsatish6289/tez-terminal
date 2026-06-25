"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import { useLearnNiftyLiveData } from "@/lib/fnoninja/use-learn-nifty-live-data";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

/** Live NIFTY Outlook preview for the Learn hub card thumbnail. */
export function LearnOutlookCardThumbnail({ accent }: { accent: string }) {
  const { levels, loading } = useLearnNiftyLiveData();

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden"
      style={{ background: accent }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
          </div>
        ) : (
          <NiftyOutlookChart
            className="h-full w-full"
            levels={levels}
            spot={levels?.spot ?? null}
            compact
          />
        )}
      </div>
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-2.5 py-1.5 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(8,15,30,0.75), transparent)" }}
      >
        <span className="text-[10px] font-black text-white tracking-wide">NIFTY</span>
        <span
          className="text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5"
          style={{ backgroundColor: "rgba(37,99,235,0.25)", color: "#93c5fd" }}
        >
          Live Outlook
        </span>
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(8,15,30,0.88) 0%, transparent 45%)" }}
      />
    </div>
  );
}
