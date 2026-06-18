"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  buildLevelsBubbleItems,
  LevelsBubblesView,
  type StockBubbleSource,
} from "@/components/levels/LevelsBubblesView";
import {
  bandsFromLevels,
  type LevelsActionableItem,
} from "@/lib/zones/levels-actionable-list";
import { deriveZoneStatus } from "@/lib/zones/zone-status";
import {
  FNO_BG_CANVAS,
  FNO_BG_TEXTURE,
  FNO_BG_TEXTURE_SIZE,
} from "@/lib/fnoninja/theme";
import { BroadcastClock } from "./BroadcastClock";
import { BroadcastExplainer } from "./BroadcastExplainer";
import { BroadcastLiveslide } from "./BroadcastLiveslide";
import { BroadcastWebinarInfoPane } from "./BroadcastWebinarInfoPane";
import { prefetchAllSymbols, prefetchSymbol } from "./broadcast-data";

interface IndexItem {
  symbol?: string;
  label: string;
  data: PublicLevels | null;
}

interface LevelsPayload {
  indices: IndexItem[];
  stocks: (StockBubbleSource & { status?: string })[];
  inZone: LevelsActionableItem[];
  fnoUniverse?: string[];
  updatedAt: string;
}

/** How often to re-pull levels. */
const POLL_MS = 60_000;
/** The branded bubble map plays as an opener for the first few minutes of the
 *  stream, then we switch to a pure stock slideshow (the slideshow is where the
 *  per-symbol value + webinar hook live). */
const OPENER_MS = 5 * 60_000;
/** Dwell per page once the slideshow is running. The stock focus page dwells
 *  long enough to roll through that symbol's news headlines; the map-only
 *  fallback (quiet days) cycles faster. */
const MAP_MS = 14_000;
const STOCK_MS = 30_000;
/** Webinar CTA between stocks — long enough to read headline + scan QR. */
const WEBINAR_MS = 10_000;

type Scene = "map" | "live";
type Page =
  | { type: "map" }
  | { type: "webinar"; afterStock: LevelsActionableItem }
  | { type: "stock"; item: LevelsActionableItem };

/** Index payload row → descriptive item the chart + info rail can render. */
function indexToItem(it: IndexItem): LevelsActionableItem | null {
  if (!it.data) return null;
  const bands = bandsFromLevels(it.data);
  if (bands.bullLow == null && bands.bearLow == null) return null;
  return {
    scope: "index",
    symbol: (it.symbol ?? it.label).toUpperCase(),
    label: it.label,
    status: deriveZoneStatus(bands),
    spot: bands.spot,
    currency: "₹",
    data: it.data,
  };
}

/** Cross-fade duration for scene swaps. */
const FADE_MS = 900;

const ON_AIR_CSS = `
@keyframes broadcast-onair-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}
.broadcast-onair-dot { animation: broadcast-onair-pulse 1.4s ease-in-out infinite; }
@keyframes broadcast-page-fade {
  0% { opacity: 0; transform: scale(0.994); }
  100% { opacity: 1; transform: scale(1); }
}
.broadcast-page-fade { animation: broadcast-page-fade ${FADE_MS}ms ease both; }
`;

export function BroadcastScene() {
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [pageIdx, setPageIdx] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      const json = (await res.json()) as LevelsPayload;
      setPayload(json);
    } catch {
      /* keep last-good payload — a transient API hiccup must never blank the stream */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const stockBySymbol = useMemo(() => {
    const m = new Map<string, StockBubbleSource>();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  const bubbleItems = useMemo(
    () =>
      payload
        ? buildLevelsBubbleItems(payload.indices, stockBySymbol, payload.fnoUniverse)
        : [],
    [payload, stockBySymbol],
  );

  // Liveslide universe: prefer in-zone names; fall back to indices (always have
  // zone data, so the chart scene works even after the close on a quiet day).
  const liveItems = useMemo<LevelsActionableItem[]>(() => {
    const inZone = payload?.inZone ?? [];
    if (inZone.length > 0) return inZone;
    return (payload?.indices ?? [])
      .map(indexToItem)
      .filter((x): x is LevelsActionableItem => x != null);
  }, [payload?.inZone, payload?.indices]);

  const liveItemKey = useMemo(
    () => liveItems.map((i) => `${i.scope}:${i.symbol}`).join("|"),
    [liveItems],
  );

  // Optional ?scene=map|live override — pins the rotation (preview/debug).
  const forcedScene = useMemo<Scene | null>(() => {
    const s = searchParams.get("scene");
    return s === "live" || s === "map" ? s : null;
  }, [searchParams]);

  // After the opener: stock → webinar CTA → next stock → webinar → …
  // The interstitial gives the next symbol time to warm in the background.
  const pages = useMemo<Page[]>(() => {
    if (forcedScene === "map") return [{ type: "map" }];
    const stocks = liveItems.map<Page>((item) => ({ type: "stock", item }));
    if (stocks.length === 0) return [{ type: "map" }];
    if (stocks.length === 1) return stocks;
    return stocks.flatMap<Page>((stock, i) => {
      if (i === 0) return [stock];
      const prev = stocks[i - 1];
      const afterStock = prev.type === "stock" ? prev.item : liveItems[i - 1];
      return [{ type: "webinar", afterStock }, stock];
    });
    // Keyed on liveItemKey (content) so a routine 60s poll that returns the same
    // symbols doesn't rebuild `pages` and reset the dwell timer mid-scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveItemKey, forcedScene]);

  // Branded bubble-map opener: hold the map for the first OPENER_MS of the
  // stream, then start the slideshow. Pinned scenes (?scene=...) skip the opener.
  const [openerDone, setOpenerDone] = useState(Boolean(forcedScene));
  useEffect(() => {
    if (forcedScene) {
      setOpenerDone(true);
      return;
    }
    setOpenerDone(false);
    const id = window.setTimeout(() => setOpenerDone(true), OPENER_MS);
    return () => window.clearTimeout(id);
  }, [forcedScene]);

  const showOpenerMap = !forcedScene && !openerDone;

  // Start the slideshow at the first symbol whenever the opener ends or the
  // forced scene changes — never on a routine in-zone poll.
  useEffect(() => {
    setPageIdx(0);
  }, [openerDone, forcedScene]);

  // Warm news + levels for the entire queue as soon as levels load. Cold AI news
  // can take 15–25s — the 14s map interstitial alone is often not enough.
  useEffect(() => {
    if (liveItems.length === 0) return;
    prefetchAllSymbols(liveItems);
  }, [liveItems]);

  // Advance to the next page after the current page's dwell time. Paused while
  // the opener map is on screen.
  useEffect(() => {
    if (showOpenerMap) return;
    if (pages.length <= 1) return;
    const current = pages[pageIdx % pages.length];
    const dwell =
      current.type === "map"
        ? MAP_MS
        : current.type === "webinar"
          ? WEBINAR_MS
          : STOCK_MS;
    const id = window.setTimeout(
      () => setPageIdx((i) => (i + 1) % pages.length),
      dwell,
    );
    return () => window.clearTimeout(id);
  }, [pageIdx, pages, showOpenerMap]);

  const page = pages[pageIdx % pages.length] ?? { type: "map" };
  const showMap = showOpenerMap || page.type === "map";
  const sceneKey = showOpenerMap
    ? "opener-map"
    : showMap
      ? "map"
      : page.type === "webinar"
        ? `stock-${page.afterStock.symbol}`
        : page.type === "stock"
          ? `stock-${page.item.symbol}`
          : "unknown";

  // Warm the NEXT page's data (levels + news + candles) in the background so it
  // paints instantly when we fade to it. During the opener we warm the whole
  // queue (see prefetchAllSymbols below); here we keep the next symbol hot.
  useEffect(() => {
    if (pages.length <= 1) return;
    const next = pages[(pageIdx + 1) % pages.length];
    if (next.type === "stock") {
      prefetchSymbol(next.item.scope, next.item.symbol);
    }
  }, [pageIdx, pages]);

  const mapPane = (
    <>
      {/* Bubble map — in-flow flex layout so LevelsBubblesView gets real height. */}
      <section
        className="relative flex flex-col min-h-0 self-stretch overflow-hidden"
        style={{ flex: "1.7 1 0%", minHeight: 0 }}
      >
        <LevelsBubblesView
          items={bubbleItems}
          onBubbleOpen={() => {}}
          hasMarketData={Boolean(payload)}
          toneFilter="all"
          layoutActive={showMap}
        />
        <div
          className="absolute z-10 flex items-center rounded-lg"
          style={{
            top: "1.4vh",
            left: "1.4vh",
            gap: "0.9vh",
            padding: "0.7vh 1.3vh",
            background: "rgba(8,15,30,0.72)",
            border: "1px solid rgba(90,140,220,0.22)",
            backdropFilter: "blur(4px)",
          }}
        >
          <span style={{ width: "0.5vh", height: "2vh", borderRadius: "999px", background: "#3b82f6" }} />
          <span className="font-black" style={{ fontSize: "1.8vh", color: "#f0f4ff" }}>
            Option-Wall Map · live F&amp;O universe
          </span>
        </div>
      </section>

      <aside
        className="flex flex-col min-h-0 self-stretch rounded-xl overflow-hidden"
        style={{
          flex: "1 1 0%",
          minHeight: 0,
          padding: "2.4vh",
          background: "linear-gradient(180deg, rgba(13,27,46,0.85), rgba(8,15,30,0.85))",
          border: "1px solid rgba(90,140,220,0.2)",
        }}
      >
        <BroadcastExplainer />
      </aside>
    </>
  );

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        backgroundColor: FNO_BG_CANVAS,
        backgroundImage: FNO_BG_TEXTURE,
        backgroundSize: FNO_BG_TEXTURE_SIZE,
        color: "#f0f4ff",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: ON_AIR_CSS }} />

      {/* Header */}
      <header
        className="flex items-center justify-between shrink-0"
        style={{
          height: "9.5vh",
          padding: "0 2.4vh",
          borderBottom: "1px solid rgba(90,140,220,0.18)",
          background: "linear-gradient(180deg, rgba(13,27,46,0.7), transparent)",
        }}
      >
        <div className="flex items-center" style={{ gap: "1.4vh" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/fnoninja/icon.svg"
            alt="FNONINJA"
            style={{ width: "5vh", height: "5vh", borderRadius: "1.2vh" }}
          />
          <div className="flex flex-col leading-none">
            <span
              className="font-black"
              style={{ fontSize: "3vh", letterSpacing: "0.02em", color: "#f0f4ff" }}
            >
              FNO<span style={{ color: "#60a5fa" }}>NINJA</span>
              <span style={{ color: "#93c5fd", fontWeight: 800 }}>.com</span>
            </span>
            <span style={{ fontSize: "1.3vh", color: "#64748b", marginTop: "0.4vh" }}>
              F&O option walls · support &amp; resistance · max-pain
            </span>
          </div>
        </div>

        <div className="flex items-center" style={{ gap: "1.8vh" }}>
          <div
            className="flex items-center rounded-full"
            style={{
              gap: "0.8vh",
              padding: "0.7vh 1.4vh",
              background: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(248,113,113,0.4)",
            }}
          >
            <span
              className="broadcast-onair-dot"
              style={{ width: "1.1vh", height: "1.1vh", borderRadius: "999px", background: "#f87171" }}
            />
            <span style={{ fontSize: "1.4vh", fontWeight: 800, color: "#fca5a5", letterSpacing: "0.08em" }}>
              ON AIR
            </span>
          </div>
          <BroadcastClock />
        </div>
      </header>

      {/* Body — one scene at a time in normal flex flow (not stacked absolute
          layers). This gives LevelsBubblesView a real height, which it needs for
          its physics layout. */}
      <main className="flex flex-1 min-h-0 overflow-hidden" style={{ padding: "2vh" }}>
        <div
          key={sceneKey}
          className={`broadcast-page-fade flex flex-1 min-h-0 w-full items-stretch${showMap ? " pointer-events-none select-none" : ""}`}
          style={{ gap: "2vh", minHeight: 0 }}
        >
          {showMap ? (
            mapPane
          ) : page.type === "webinar" ? (
            <BroadcastLiveslide
              item={page.afterStock}
              infoPane={<BroadcastWebinarInfoPane />}
            />
          ) : page.type === "stock" ? (
            <BroadcastLiveslide item={page.item} />
          ) : (
            mapPane
          )}
        </div>
      </main>
    </div>
  );
}
