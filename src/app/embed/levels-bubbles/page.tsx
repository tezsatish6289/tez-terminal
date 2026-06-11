"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { buildLevelsBubbleItems, LevelsBubblesView } from "@/components/levels/LevelsBubblesView";
import { levelsBubblesPagePathForHost } from "@/lib/levels/levels-chart-url";
import { FNO_BG_CANVAS } from "@/lib/fnoninja/theme";
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

/** Live bubble map for landing-page iframe — any bubble click opens the full map. */
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

  const openFullBubbleMap = useCallback(() => {
    const url = levelsBubblesPagePathForHost(window.location.hostname);
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch {
      /* cross-origin guard */
    }
    window.location.href = url;
  }, []);

  return (
    <div
      className="h-[100dvh] w-full min-h-[240px] overflow-hidden"
      style={{ backgroundColor: FNO_BG_CANVAS }}
    >
      <LevelsBubblesView
        items={bubbleItems}
        onBubbleOpen={openFullBubbleMap}
        hasMarketData={Boolean(payload)}
        toneFilter="all"
      />
    </div>
  );
}
