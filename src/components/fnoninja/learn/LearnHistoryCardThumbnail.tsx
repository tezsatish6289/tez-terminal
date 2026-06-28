"use client";

import { OiHistoryChart } from "@/components/levels/OiHistoryChart";

/** Live NIFTY History preview for the Learn hub card. */
export function LearnHistoryCardThumbnail({ accent }: { accent: string }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden" style={{ background: accent }}>
      <div className="absolute inset-0 p-1.5 pt-2">
        <OiHistoryChart
          scope="index"
          symbol="NIFTY"
          className="h-full w-full min-h-0"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(8,15,30,0.75) 0%, transparent 45%)" }}
      />
    </div>
  );
}
