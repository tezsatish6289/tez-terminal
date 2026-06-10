"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  buildLevelsBubbleItems,
  LevelsBubblesView,
  type LevelsBubbleItem,
} from "@/components/levels/LevelsBubblesView";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
interface RawItem {
  symbol?: string;
  label: string;
  data: PublicLevels | null;
}

interface StockListItem {
  symbol: string;
  label: string;
  spot: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  halfWidth?: number | null;
  computedAt?: string | null;
  levelsSource?: PublicLevels["levelsSource"];
}

interface LevelsPayload {
  indices: RawItem[];
  stocks: StockListItem[];
  updatedAt: string;
}

/** Live bubble map for landing-page iframe — bubble click opens chart in a new tab. */
export default function LevelsBubblesEmbedPage() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      const json = (await res.json()) as LevelsPayload;
      setPayload(json);
    } catch {
      /* keep last-good */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const stockBySymbol = useMemo(() => {
    const m = new Map<string, StockListItem>();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  const bubbleItems = useMemo(
    () => (payload ? buildLevelsBubbleItems(payload.indices, stockBySymbol) : []),
    [payload, stockBySymbol],
  );

  const openBubbleChart = useCallback((item: LevelsBubbleItem) => {
    const url = levelsChartPagePathForHost(window.location.hostname, item.scope, item.symbol);
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div
      className="h-[100dvh] w-full min-h-[240px] overflow-hidden"
      style={{ backgroundColor: "#060912" }}
    >
      <LevelsBubblesView
        items={bubbleItems}
        onBubbleOpen={openBubbleChart}
        hasMarketData={Boolean(payload)}
        toneFilter="all"
      />
    </div>
  );
}
