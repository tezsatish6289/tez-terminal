"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { BroadcastTicker } from "./BroadcastTicker";

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
/** Map scene vs Liveslide scene cadence, and per-symbol dwell inside Liveslide. */
const SCENE_MS = 42_000;
const LIVE_SYMBOL_MS = 12_000;

type Scene = "map" | "live";

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

const ON_AIR_CSS = `
@keyframes broadcast-onair-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}
.broadcast-onair-dot { animation: broadcast-onair-pulse 1.4s ease-in-out infinite; }
`;

export function BroadcastScene() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [scene, setScene] = useState<Scene>("map");
  const [liveIdx, setLiveIdx] = useState(0);

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

  const canLive = liveItems.length > 0;

  // Optional ?scene=map|live override — pins one scene (preview/debug). When
  // pinned we skip auto-rotation entirely.
  const forcedScene = useMemo<Scene | null>(() => {
    if (typeof window === "undefined") return null;
    const s = new URLSearchParams(window.location.search).get("scene");
    return s === "live" || s === "map" ? s : null;
  }, []);

  useEffect(() => {
    if (forcedScene) {
      setScene(forcedScene);
      return;
    }
  }, [forcedScene]);

  // Alternate Map ↔ Liveslide. Only enter Liveslide when we have symbols to show.
  useEffect(() => {
    if (forcedScene) return;
    const id = window.setInterval(() => {
      setScene((s) => (s === "map" && canLive ? "live" : "map"));
    }, SCENE_MS);
    return () => window.clearInterval(id);
  }, [canLive, forcedScene]);

  // Advance the per-symbol Liveslide while that scene is on screen.
  useEffect(() => {
    if (scene !== "live" || liveItems.length === 0) return;
    const id = window.setInterval(() => {
      setLiveIdx((i) => (i + 1) % liveItems.length);
    }, LIVE_SYMBOL_MS);
    return () => window.clearInterval(id);
  }, [scene, liveItems.length]);

  const liveItem = liveItems.length ? liveItems[liveIdx % liveItems.length] : null;
  const showLive = scene === "live" && liveItem != null;

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
            </span>
            <span style={{ fontSize: "1.3vh", color: "#64748b", marginTop: "0.4vh" }}>
              F&O option walls · support &amp; resistance · max-pain
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end" style={{ gap: "1vh" }}>
          {/* Marketing anchor — the one thing a viewer should remember. */}
          <div
            className="flex items-center font-black rounded-full"
            style={{
              gap: "0.9vh",
              padding: "0.9vh 1.8vh",
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              color: "#ffffff",
              fontSize: "2.5vh",
              letterSpacing: "0.04em",
              boxShadow: "0 0 26px rgba(59,130,246,0.45)",
            }}
          >
            <img
              src="/fnoninja/icon.svg"
              alt=""
              aria-hidden
              style={{ width: "2.4vh", height: "2.4vh", borderRadius: "0.6vh" }}
            />
            FNONINJA.COM
          </div>

          <div className="flex items-center" style={{ gap: "1.4vh" }}>
            <div
              className="flex items-center rounded-full"
              style={{
                gap: "0.7vh",
                padding: "0.4vh 1vh",
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.4)",
              }}
            >
              <span
                className="broadcast-onair-dot"
                style={{ width: "1vh", height: "1vh", borderRadius: "999px", background: "#f87171" }}
              />
              <span style={{ fontSize: "1.25vh", fontWeight: 800, color: "#fca5a5", letterSpacing: "0.08em" }}>
                ON AIR
              </span>
            </div>
            <BroadcastClock />
          </div>
        </div>
      </header>

      {/* Body — alternates between the Map scene and the Liveslide scene. */}
      <main className="flex flex-1 min-h-0" style={{ gap: "2vh", padding: "2vh" }}>
        {showLive ? (
          <BroadcastLiveslide
            item={liveItem}
            index={liveIdx % liveItems.length}
            total={liveItems.length}
          />
        ) : (
          <>
            {/* Bubble map — non-interactive in broadcast (no hover tooltips / cursors).
                Title overlaid inside so the panel matches the explainer box height. */}
            <section className="relative flex flex-col min-h-0" style={{ flex: "1.7 1 0%" }}>
              <div className="flex-1 min-h-0 pointer-events-none select-none">
                <LevelsBubblesView
                  items={bubbleItems}
                  onBubbleOpen={() => {}}
                  hasMarketData={Boolean(payload)}
                  toneFilter="all"
                />
              </div>
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

            {/* Explainer panel — what FNONINJA is / how it works (policy-safe, no setups). */}
            <aside
              className="flex flex-col min-h-0 rounded-xl"
              style={{
                flex: "1 1 0%",
                padding: "2.4vh",
                background: "linear-gradient(180deg, rgba(13,27,46,0.85), rgba(8,15,30,0.85))",
                border: "1px solid rgba(90,140,220,0.2)",
              }}
            >
              <BroadcastExplainer />
            </aside>
          </>
        )}
      </main>

      <BroadcastTicker />
    </div>
  );
}
