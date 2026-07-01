"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  bubbleStackZIndex,
  createPhysicsNodes,
  isInZoneTone,
  layoutBubbleRadius,
  stepPhysics,
  type PhysicsNode,
} from "@/lib/levels/bubble-physics";
import { pickEmbedMobileLayoutItems } from "@/lib/levels/embed-mobile-layout";
import {
  deriveBubbleDisplayTone,
  resolveBubbleVisual,
  type BubbleTone,
} from "@/lib/zones/bubble-tone";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import { FNO_UNIVERSE_ALPHA } from "@/lib/nse/fno-universe";
import {
  bubbleMatchesMapFilter,
  countBubbleMapFilters,
  type BubbleMapFilter,
} from "@/lib/zones/bubble-map-filter";
import {
  LevelsBubbleToneSummary,
  type BubbleToneSummaryKey,
} from "@/components/levels/LevelsBubbleToneSummary";
import { levelsFromStockRow } from "@/lib/zones/levels-actionable-list";
import { matchesSlideshowSetup, type ZoneBands } from "@/lib/zones/zone-status";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";
import { FNO_BUBBLE_MAP_SURFACE_STYLE } from "@/lib/fnoninja/theme";

export interface LevelsBubbleItem {
  id: string;
  symbol: string;
  label: string;
  scope: "index" | "stock";
  tone: BubbleTone;
  spot: number | null;
  poc: number | null;
  bands: ZoneBands;
  data: PublicLevels | null;
  /** Passes directional + 1:2 POC RR (same gate as slideshow In-Zone list). */
  meetsActionableFilter?: boolean;
}

const BUBBLE_ANIM_CSS = `
@keyframes levels-bubble-pop-in {
  0% { transform: scale(0.55); filter: brightness(1.35); }
  45% { transform: scale(1.18); }
  70% { transform: scale(0.94); }
  100% { transform: scale(1); filter: brightness(1); }
}
@keyframes levels-bubble-pop-out {
  0% { transform: scale(1); }
  35% { transform: scale(1.1); filter: brightness(1.2); }
  100% { transform: scale(0.88); filter: brightness(0.85); }
}
.levels-bubble-pop-in {
  animation: levels-bubble-pop-in 0.55s cubic-bezier(0.34, 1.45, 0.64, 1) forwards;
}
.levels-bubble-pop-out {
  animation: levels-bubble-pop-out 0.45s ease-out forwards;
}
@keyframes levels-bubble-showcase-breathe {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.035); filter: brightness(1.1); }
}
.levels-bubble-showcase-breathe {
  animation: levels-bubble-showcase-breathe 2.8s ease-in-out infinite;
}
@keyframes levels-bubble-showcase-breathe-mobile {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.06); filter: brightness(1.18); }
}
.levels-bubble-showcase-breathe-mobile {
  animation: levels-bubble-showcase-breathe-mobile 2.4s ease-in-out infinite;
}
`;

export function LevelsBubblesView({
  items,
  onBubbleOpen,
  hasMarketData = true,
  toneFilter = "all",
  searchQuery = "",
  layoutActive = true,
  physicsIntensity = 1,
  showToneSummary = false,
  showcaseEmphasis = "all",
  /** Softer, non-looping emphasis when only one filter has setups. */
  showcaseSolo = false,
  /** Scales bubble radii for tight embed viewports (e.g. mobile hero). */
  layoutScale = 1,
  /** Landing iframe on mobile: fewer bubbles, zone stocks centered. */
  embedMobileLayout = false,
}: {
  items: LevelsBubbleItem[];
  onBubbleOpen: (item: LevelsBubbleItem) => void;
  /** False when /api/freedombot/levels has not loaded yet or failed. */
  hasMarketData?: boolean;
  /** Map filter from toolbar (At Support, Near Support, …). */
  toneFilter?: BubbleMapFilter;
  /** Search string from parent toolbar. */
  searchQuery?: string;
  /** When true, re-measure the container (e.g. broadcast map scene is visible). */
  layoutActive?: boolean;
  /** Scales bubble drift / collision energy (embed preview uses a calmer default). */
  physicsIntensity?: number;
  /** Compact At/Near support & resistance counts above the map. */
  showToneSummary?: boolean;
  /**
   * Landing showcase: keep all bubbles visible but enlarge + foreground matches
   * (does not filter items out — use toneFilter for that).
   */
  showcaseEmphasis?: BubbleMapFilter;
  showcaseSolo?: boolean;
  layoutScale?: number;
  embedMobileLayout?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<PhysicsNode<LevelsBubbleItem>[]>([]);
  const elRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevTonesRef = useRef<Map<string, BubbleTone>>(new Map());
  const rafRef = useRef<number>(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [popClass, setPopClass] = useState<Record<string, "in" | "out">>({});
  const [layoutReady, setLayoutReady] = useState(false);
  const physicsFrameRef = useRef(0);
  const showcaseEmphasisRef = useRef(showcaseEmphasis);
  showcaseEmphasisRef.current = showcaseEmphasis;
  const showcaseSoloRef = useRef(showcaseSolo);
  showcaseSoloRef.current = showcaseSolo;
  const layoutScaleRef = useRef(layoutScale);
  layoutScaleRef.current = layoutScale;
  const embedMobileLayoutRef = useRef(embedMobileLayout);
  embedMobileLayoutRef.current = embedMobileLayout;

  const syncSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 40 || h < 40) return;
    setSize({ w, h });
  }, []);

  useEffect(() => {
    syncSize();
    const el = containerRef.current;
    if (!el) return;
    let debounceId = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(syncSize, 120);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(debounceId);
      ro.disconnect();
    };
  }, [syncSize]);

  const layoutItems = useMemo(() => {
    if (!embedMobileLayout) return items;
    return pickEmbedMobileLayoutItems(items);
  }, [items, embedMobileLayout]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return layoutItems.filter((it) => {
      if (!bubbleMatchesMapFilter(it.tone, toneFilter)) return false;
      if (!q) return true;
      return (
        it.symbol.toUpperCase().includes(q) ||
        it.label.toUpperCase().includes(q)
      );
    });
  }, [layoutItems, searchQuery, toneFilter]);

  const filteredIds = useMemo(
    () => filtered.map((it) => it.id).join("|"),
    [filtered],
  );

  const toneCounts = useMemo(() => countBubbleMapFilters(items), [items]);

  const showcaseActiveKey: BubbleToneSummaryKey | null =
    showcaseEmphasis === "IN_BULL" ||
    showcaseEmphasis === "NEAR_BULL" ||
    showcaseEmphasis === "IN_BEAR" ||
    showcaseEmphasis === "NEAR_BEAR"
      ? showcaseEmphasis
      : null;

  // Broadcast map scene mounts in-flow when visible — kick layout after paint.
  useEffect(() => {
    if (!layoutActive) return;
    syncSize();
    let outer = 0;
    let inner = 0;
    outer = window.requestAnimationFrame(() => {
      syncSize();
      inner = window.requestAnimationFrame(syncSize);
    });
    const t = window.setTimeout(syncSize, 450);
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
      window.clearTimeout(t);
    };
  }, [layoutActive, syncSize, filteredIds, items.length]);

  useEffect(() => {
    if (size.w < 120 || size.h < 120) {
      setLayoutReady(false);
      return;
    }
    setLayoutReady(false);
    const t = window.setTimeout(() => setLayoutReady(true), 400);
    return () => window.clearTimeout(t);
  }, [size.w, size.h]);

  useEffect(() => {
    const nextPop: Record<string, "in" | "out"> = {};
    for (const it of filtered) {
      const prev = prevTonesRef.current.get(it.id);
      if (prev != null && prev !== it.tone) {
        const wasIn = isInZoneTone(prev);
        const nowIn = isInZoneTone(it.tone);
        if (nowIn && !wasIn) nextPop[it.id] = "in";
        else if (wasIn && !nowIn) nextPop[it.id] = "out";
      }
      prevTonesRef.current.set(it.id, it.tone);
    }
    if (Object.keys(nextPop).length > 0) {
      setPopClass((p) => ({ ...p, ...nextPop }));
      const t = window.setTimeout(() => {
        setPopClass((p) => {
          const copy = { ...p };
          for (const id of Object.keys(nextPop)) delete copy[id];
          return copy;
        });
      }, 600);
      return () => window.clearTimeout(t);
    }
  }, [filtered, filteredIds]);

  useEffect(() => {
    if (!layoutReady || size.w < 120 || size.h < 120) return;

    const existing = embedMobileLayoutRef.current
      ? new Map<string, PhysicsNode<LevelsBubbleItem>>()
      : new Map(nodesRef.current.map((n) => [n.id, n]));
    const scale = layoutScaleRef.current;
    const mobileEmbed = embedMobileLayoutRef.current;
    nodesRef.current = createPhysicsNodes(filtered, size.w, size.h, existing, {
      radiusScale: scale,
      mobileEmbed,
    });

    for (const n of nodesRef.current) {
      n.r = layoutBubbleRadius(n.item.scope, n.item.tone, scale, mobileEmbed);
      if (!existing.has(n.id)) {
        n.vx = 0;
        n.vy = 0;
      }
      // Preserved positions may come from a transient wrong-size layout (e.g. a
      // freshly-mounted broadcast scene measured mid-fade). Clamp into current
      // bounds so a bubble can never get stranded off-screen and "disappear".
      n.x = Math.max(n.r + 8, Math.min(size.w - n.r - 8, n.x));
      n.y = Math.max(n.r + 8, Math.min(size.h - n.r - 8, n.y));
    }

    physicsFrameRef.current = 0;
    if (physicsIntensity <= 0) {
      for (const n of nodesRef.current) {
        n.vx = 0;
        n.vy = 0;
      }
    }

    const applyPositions = () => {
      const emphasis = showcaseEmphasisRef.current;
      const emphasisActive = emphasis !== "all";
      const solo = showcaseSoloRef.current && emphasisActive;
      const scale = layoutScaleRef.current;
      const mobileEmbed = embedMobileLayoutRef.current;
      for (const n of nodesRef.current) {
        const el = elRefs.current.get(n.id);
        if (!el) continue;
        const matched =
          emphasisActive && bubbleMatchesMapFilter(n.item.tone, emphasis);
        const targetR = (() => {
          const baseR = layoutBubbleRadius(n.item.scope, n.item.tone, scale, mobileEmbed);
          if (!emphasisActive) return baseR;
          if (matched) {
            if (solo) {
              const boost = mobileEmbed ? 1.44 : 1.26;
              return baseR * (n.item.scope === "index" ? 1.08 : boost);
            }
            return baseR * (n.item.scope === "index" ? 1.14 : 1.48);
          }
          if (n.item.scope === "index") return baseR * (solo ? 0.95 : 0.9);
          return baseR * (solo ? (mobileEmbed ? 0.72 : 0.88) : 0.76);
        })();
        n.r += (targetR - n.r) * (emphasisActive ? 0.14 : 0.22);
        if (mobileEmbed && matched && emphasisActive) {
          const cx = size.w * 0.5;
          const cy = size.h * 0.42;
          n.x += (cx - n.x) * 0.07;
          n.y += (cy - n.y) * 0.07;
        }
        const d = n.r * 2;
        el.style.width = `${d}px`;
        el.style.height = `${d}px`;
        el.style.transform = `translate3d(${n.x - n.r}px, ${n.y - n.r}px, 0)`;
        if (matched) {
          el.style.zIndex = "320";
          el.style.opacity = "1";
        } else if (emphasisActive) {
          el.style.zIndex = String(n.item.scope === "index" ? 8 : 4);
          el.style.opacity = solo
            ? n.item.scope === "index"
              ? "0.58"
              : "0.46"
            : n.item.scope === "index"
              ? "0.42"
              : "0.24";
        } else {
          el.style.zIndex = String(bubbleStackZIndex(n.item.scope, n.item.tone));
          el.style.opacity = "1";
        }
        el.style.transition = emphasisActive
          ? "opacity 0.55s ease"
          : "opacity 0.35s ease";
      }
    };

    applyPositions();

    const loop = () => {
      physicsFrameRef.current += 1;
      const frame = physicsFrameRef.current;
      if (frame > 90 && physicsIntensity > 0) {
        const t = Math.min(1, (frame - 90) / 120);
        stepPhysics(nodesRef.current, size.w, size.h, (0.06 + t * 0.06) * physicsIntensity);
      }
      applyPositions();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [filteredIds, size.w, size.h, layoutReady, physicsIntensity, layoutScale, embedMobileLayout]);

  const setBubbleRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) elRefs.current.set(id, el);
    else elRefs.current.delete(id);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full max-md:flex-none max-md:min-h-[min(62dvh,560px)]">
      <style dangerouslySetInnerHTML={{ __html: BUBBLE_ANIM_CSS }} />

      {showToneSummary ? (
        <LevelsBubbleToneSummary counts={toneCounts} activeKey={showcaseActiveKey} />
      ) : null}

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 max-md:min-h-[min(58dvh,520px)] rounded-xl overflow-hidden"
        style={{
          ...FNO_BUBBLE_MAP_SURFACE_STYLE,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {filtered.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-center px-4" style={{ color: "#64748b" }}>
              {!hasMarketData
                ? "Loading market data…"
                : items.length === 0
                  ? "No market data yet."
                  : "No symbols match your filters."}
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const style = resolveBubbleVisual(item.scope, item.tone);
            const r = layoutBubbleRadius(
              item.scope,
              item.tone,
              layoutScale,
              embedMobileLayout,
            );
            const fontMain = Math.max(
              10,
              Math.min(item.scope === "index" ? 17 : 14, r * 0.22),
            );
            const fontSub = Math.max(8, fontMain - 2);
            const pop = popClass[item.id];
            const popAnim =
              pop === "in"
                ? "levels-bubble-pop-in"
                : pop === "out"
                  ? "levels-bubble-pop-out"
                  : "";
            const borderW = style.borderWidth;
            const emphMatched =
              showcaseEmphasis !== "all" &&
              bubbleMatchesMapFilter(item.tone, showcaseEmphasis);
            const breatheAnim =
              showcaseSolo && emphMatched
                ? embedMobileLayout
                  ? "levels-bubble-showcase-breathe-mobile"
                  : "levels-bubble-showcase-breathe"
                : "";
            return (
              <div
                key={item.id}
                ref={(el) => setBubbleRef(item.id, el)}
                className="absolute left-0 top-0 will-change-transform"
                style={{ width: r * 2, height: r * 2 }}
              >
                <button
                  type="button"
                  onClick={() => onBubbleOpen(item)}
                  className={`w-full h-full flex flex-col items-center justify-center rounded-full hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer ${popAnim} ${breatheAnim}`}
                  style={{
                    background: style.fill,
                    border: `${borderW}px ${style.borderStyle} ${style.border}`,
                    boxShadow: style.glow,
                    transition:
                      "box-shadow 0.35s ease, background 0.35s ease, border-color 0.35s ease, border-width 0.35s ease",
                  }}
                  aria-label={`${item.label}, ${style.label}`}
                  title={`${item.label} · ${style.label} — click for chart`}
                >
                  <span
                    className="font-black leading-none text-center px-1 truncate max-w-[92%] pointer-events-none"
                    style={{ fontSize: fontMain, color: style.textColor }}
                  >
                    {item.symbol}
                  </span>
                  {item.spot != null && (
                    <span
                      className="font-mono tabular-nums mt-0.5 opacity-90 pointer-events-none"
                      style={{ fontSize: fontSub, color: style.textMutedColor }}
                    >
                      {item.spot >= 1000
                        ? item.spot.toLocaleString("en-IN", { maximumFractionDigits: 0 })
                        : item.spot.toFixed(2)}
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export type StockBubbleSource = {
  symbol: string;
  label: string;
  spot: number | null;
  maxPain: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  halfWidth?: number | null;
  computedAt?: string | null;
  oi?: OiWallMomentum | null;
};

/** Full map: indices + F&O universe (tones gated by 2:1 POC RR). */
export function buildLevelsBubbleItems(
  indices: { symbol?: string; label: string; data: PublicLevels | null }[],
  stockBySymbol: Map<string, StockBubbleSource>,
  stockUniverse?: readonly string[],
): LevelsBubbleItem[] {
  const out: LevelsBubbleItem[] = [];
  const universe = stockUniverse?.length ? stockUniverse : FNO_UNIVERSE_ALPHA;

  for (const it of indices) {
    const symbol = (it.symbol ?? it.label).toUpperCase();
    const id = `index-${symbol}`;
    const bands: ZoneBands = {
      spot: it.data?.spot ?? null,
      bullLow: it.data?.bullLow ?? null,
      bullHigh: it.data?.bullHigh ?? null,
      bearLow: it.data?.bearLow ?? null,
      bearHigh: it.data?.bearHigh ?? null,
    };
    const poc = it.data?.poc ?? null;
    const bandOffset = it.data?.bandOffset ?? null;
    const oi = it.data?.oi ?? null;
    const actionable = matchesSlideshowSetup(bands, poc, "all", bandOffset, oi);
    out.push({
      id,
      symbol,
      label: it.label,
      scope: "index",
      tone: deriveBubbleDisplayTone(bands, true, actionable, poc, bandOffset, oi),
      spot: bands.spot,
      poc,
      bands,
      data: it.data,
      meetsActionableFilter: actionable,
    });
  }

  for (const sym of universe) {
    const st = stockBySymbol.get(sym);
    const scanned = Boolean(st);
    const bands: ZoneBands = {
      spot: st?.spot ?? null,
      bullLow: st?.bullZoneLow ?? null,
      bullHigh: st?.bullZoneHigh ?? null,
      bearLow: st?.bearZoneLow ?? null,
      bearHigh: st?.bearZoneHigh ?? null,
    };
    const id = `stock-${sym}`;
    const stockLevels = st ? levelsFromStockRow(st) : null;
    const poc = stockLevels?.poc ?? null;
    const bandOffset = stockLevels?.bandOffset ?? null;
    const oi = st?.oi ?? null;
    const actionable =
      scanned && matchesSlideshowSetup(bands, poc, "all", bandOffset, oi);
    out.push({
      id,
      symbol: sym,
      label: fnoCompanyName(sym) ?? st?.label ?? sym,
      scope: "stock",
      tone: deriveBubbleDisplayTone(bands, scanned, actionable, poc, bandOffset, oi),
      spot: bands.spot,
      poc,
      bands,
      data: null,
      meetsActionableFilter: actionable,
    });
  }

  return out;
}

/** Slideshow row → bubble shape (subset of the full map). */
export function inZoneItemToBubbleItem(it: {
  scope: "index" | "stock";
  symbol: string;
  label: string;
  spot: number | null;
  data: PublicLevels | null;
}): LevelsBubbleItem {
  const bands: ZoneBands = {
    spot: it.spot ?? it.data?.spot ?? null,
    bullLow: it.data?.bullLow ?? null,
    bullHigh: it.data?.bullHigh ?? null,
    bearLow: it.data?.bearLow ?? null,
    bearHigh: it.data?.bearHigh ?? null,
  };
  const poc = it.data?.poc ?? null;
  const bandOffset = it.data?.bandOffset ?? null;
  const oi = it.data?.oi ?? null;
  const actionable = matchesSlideshowSetup(bands, poc, "all", bandOffset, oi);
  return {
    id: `${it.scope}-${it.symbol}`,
    symbol: it.symbol,
    label: it.label,
    scope: it.scope,
    tone: deriveBubbleDisplayTone(bands, true, actionable, poc, bandOffset, oi),
    spot: bands.spot,
    poc: it.data?.poc ?? null,
    bands,
    data: it.data,
    meetsActionableFilter: actionable,
  };
}
