"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  buildLevelsBubbleItems,
  bubbleMatchesInZoneView,
  LevelsBubblesView,
} from "@/components/levels/LevelsBubblesView";
import { levelsChartPagePath } from "@/lib/levels/levels-chart-url";
import { FNO_UNIVERSE_ALPHA } from "@/lib/nse/fno-universe";
import type { PocDirectionFilter, ZoneStatus } from "@/lib/zones/zone-status";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";

interface RawItem {
  symbol?: string;
  label: string;
  data: PublicLevels | null;
}

interface StockListItem {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  maxPain: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
}

interface LevelsPayload {
  indices: RawItem[];
  stocks: StockListItem[];
  updatedAt: string;
}

const HEX_BG = `
  radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.12), transparent),
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
  #060912
`;

const PAGE_TITLE = "Market Bubbles";
const PAGE_SUBTITLE =
  "Solid green/red = in band · dashed lime/orange = near band · grey dashed = awaiting scan · click a bubble for chart.";

export default function LevelsPage() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [inZoneView, setInZoneView] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<PocDirectionFilter>("all");
  const [bubblesHideNeutral, setBubblesHideNeutral] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      const json = (await res.json()) as LevelsPayload & { inZone?: unknown };
      setPayload({
        indices: json.indices ?? [],
        stocks: json.stocks ?? [],
        updatedAt: json.updatedAt ?? new Date().toISOString(),
      });
    } catch {
      /* keep last-good */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const stockBySymbol = useMemo(() => {
    const m = new Map<
      string,
      {
        symbol: string;
        label: string;
        spot: number | null;
        maxPain: number | null;
        bullZoneLow: number | null;
        bullZoneHigh: number | null;
        bearZoneLow: number | null;
        bearZoneHigh: number | null;
      }
    >();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  const bubbleItems = useMemo(
    () => (payload ? buildLevelsBubbleItems(payload.indices, stockBySymbol) : []),
    [payload, stockBySymbol],
  );

  const alignedCount = useMemo(
    () => bubbleItems.filter((it) => bubbleMatchesInZoneView(it, "all")).length,
    [bubbleItems],
  );

  const bubbleScanNote = useMemo(() => {
    const scanned = payload?.stocks?.length ?? 0;
    const total = FNO_UNIVERSE_ALPHA.length;
    const batch = 12;
    const runs = Math.ceil(total / batch);
    return (
      `F&O levels refresh in a round-robin on the Auto Zones cron (~${batch} stocks per run, ~${runs} runs for full sweep). ` +
      `${scanned} of ${total} in the database — grey dashed = not reached yet. ` +
      `${alignedCount} aligned setups (in band + max pain on pull side).`
    );
  }, [payload?.stocks, alignedCount]);

  const openBubbleChart = useCallback((item: { scope: "index" | "stock"; symbol: string }) => {
    const path = levelsChartPagePath(item.scope, item.symbol);
    window.open(path, "_blank", "noopener,noreferrer");
  }, []);

  const scheduleNote = "Updates Mon–Fri during market hours";

  return (
    <main
      className="h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundColor: "#060912",
        backgroundImage: HEX_BG,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px, 100% 100%",
      }}
    >
      <div className="flex-1 min-h-0 w-full max-w-[100rem] mx-auto px-3 sm:px-5 py-3 sm:py-4 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="shrink-0 text-center mb-2 px-2">
              <h1
                className="text-lg sm:text-xl font-black tracking-tight"
                style={{ color: "#f8fafc" }}
              >
                {PAGE_TITLE}
              </h1>
              <p className="mt-1 text-[10px] max-w-2xl mx-auto leading-snug" style={{ color: "#64748b" }}>
                {PAGE_SUBTITLE}
              </p>
            </div>
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <LevelsBubblesView
                items={bubbleItems}
                onBubbleOpen={openBubbleChart}
                hideNeutral={bubblesHideNeutral}
                onHideNeutralChange={setBubblesHideNeutral}
                inZoneView={inZoneView}
                onInZoneViewChange={setInZoneView}
                zoneFilter={zoneFilter}
                onZoneFilterChange={setZoneFilter}
                alignedCount={alignedCount}
                scanNote={bubbleScanNote}
              />
              <p className="shrink-0 text-center text-[9px] py-1.5" style={{ color: "#475569" }}>
                {scheduleNote}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
