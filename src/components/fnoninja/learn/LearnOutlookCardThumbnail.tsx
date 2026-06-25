"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

const NIFTY = "NIFTY";

/** Live NIFTY Outlook preview for the Learn hub card thumbnail. */
export function LearnOutlookCardThumbnail({ accent }: { accent: string }) {
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/freedombot/levels", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { indices?: { symbol?: string; data: PublicLevels | null }[] }) => {
        if (cancelled) return;
        const hit = json.indices?.find(
          (it) => (it.symbol ?? "").toUpperCase() === NIFTY,
        );
        setLevels(hit?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setLevels(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
