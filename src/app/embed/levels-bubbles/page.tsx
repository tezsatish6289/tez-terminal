"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { buildLevelsBubbleItems, LevelsBubblesView } from "@/components/levels/LevelsBubblesView";
import {
  bubbleShowcaseSteps,
  runBubbleShowcaseCycle,
} from "@/lib/levels/bubble-showcase-cycle";
import { levelsBubblesPagePathForHost } from "@/lib/levels/levels-chart-url";
import type { BubbleMapFilter } from "@/lib/zones/bubble-map-filter";
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
  fnoUniverse?: string[];
  updatedAt: string;
}

/** Live bubble map for landing-page iframe — any bubble click opens the full map. */
export default function LevelsBubblesEmbedPage() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [showcaseEmphasis, setShowcaseEmphasis] = useState<BubbleMapFilter>("all");
  const [physicsIntensity, setPhysicsIntensity] = useState(0.25);
  const [layoutScale, setLayoutScale] = useState(1);
  const [embedMobileLayout, setEmbedMobileLayout] = useState(false);

  useEffect(() => {
    const applyViewport = () => {
      const narrow = window.innerWidth < 768;
      setPhysicsIntensity(narrow ? 0 : 0.25);
      setLayoutScale(narrow ? 0.62 : 1);
      setEmbedMobileLayout(narrow);
    };
    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

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
    () => (payload ? buildLevelsBubbleItems(payload.indices, stockBySymbol, payload.fnoUniverse) : []),
    [payload, stockBySymbol],
  );

  const showcaseSteps = useMemo(() => bubbleShowcaseSteps(bubbleItems), [bubbleItems]);
  const showcaseSolo = showcaseSteps.length === 1;

  useEffect(() => {
    if (!payload || bubbleItems.length === 0) return;
    return runBubbleShowcaseCycle(showcaseSteps, setShowcaseEmphasis);
  }, [payload, bubbleItems, showcaseSteps]);

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
        physicsIntensity={physicsIntensity}
        layoutScale={layoutScale}
        embedMobileLayout={embedMobileLayout}
        showToneSummary
        showcaseEmphasis={showcaseEmphasis}
        showcaseSolo={showcaseSolo}
      />
    </div>
  );
}
