"use client";

import { Loader2 } from "lucide-react";
import { OiHistoryChart } from "@/components/levels/OiHistoryChart";
import { FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

/** Embedded History chart for the learn guide — defaults to NIFTY. */
export function FnoNinjaHistoryLiveVisual({
  symbol = "NIFTY",
  loading = false,
}: {
  symbol?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden min-h-[320px] sm:min-h-[380px] flex flex-col"
      style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
    >
      {loading ? (
        <div className="flex flex-1 items-center justify-center min-h-[320px]">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
        </div>
      ) : (
        <OiHistoryChart scope="index" symbol={symbol} className="flex-1 min-h-[320px] sm:min-h-[380px] w-full" />
      )}
    </div>
  );
}
