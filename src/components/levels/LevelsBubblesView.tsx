"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  bubbleStackZIndex,
  CHAT_MAP_BUBBLE_RADIUS,
  clampNodesToBounds,
  createChatMapBubbleNode,
  createPhysicsNodes,
  isInZoneTone,
  layoutBubbleRadius,
  pinAffiliateMapBubble,
  pinChatMapBubble,
  repelNodesFromChatBubble,
  stepPhysics,
  type PhysicsNode,
} from "@/lib/levels/bubble-physics";
import { pickEmbedMobileLayoutItems } from "@/lib/levels/embed-mobile-layout";
import {
  bubbleMapDisplayTone,
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
import type { GuestBubbleLabel } from "@/lib/fnoninja/guest-map-preview";
import { LevelsChatMapBubble } from "@/components/levels/LevelsChatMapBubble";
import { LevelsMmiBubbleContent } from "@/components/levels/LevelsMmiBubbleContent";
import { LevelsFlashSaleBubbleContent } from "@/components/levels/LevelsFlashSaleBubbleContent";
import { LevelsAffiliateBubbleContent } from "@/components/levels/LevelsAffiliateBubbleContent";
import {
  formatMmiAria,
  isMmiBubbleId,
  MMI_BUBBLE_ID,
  MMI_ZONE_META,
  type MmiSnapshot,
} from "@/lib/fnoninja/mmi";
import {
  FLASH_SALE_BUBBLE_ID,
  isFlashSaleBubbleId,
  type FlashSalePublicState,
} from "@/lib/fnoninja/flash-sale";
import { AFFILIATE_BUBBLE_ID, isAffiliateBubbleId } from "@/lib/fnoninja/affiliate-shared";
import { trackCtaClick } from "@/firebase/analytics";
import { computeLightAtlasScore } from "@/lib/levels/light-atlas-score";

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
  /**
   * Light Atlas primary score from payload fields only (no PVT / IV history).
   * Used for the map quality gate (default hide ≤ 60).
   */
  atlasScore?: number | null;
  /** Special map bubble — MMI, flash-sale, or Refer & Earn. */
  kind?: "mmi" | "flash_sale" | "affiliate";
  mmi?: MmiSnapshot | null;
  flashSale?: FlashSalePublicState | null;
}

function isSpecialMapBubble(item: Pick<LevelsBubbleItem, "id" | "kind">): boolean {
  return (
    item.kind === "mmi" ||
    item.kind === "flash_sale" ||
    item.kind === "affiliate" ||
    isMmiBubbleId(item.id) ||
    isFlashSaleBubbleId(item.id) ||
    isAffiliateBubbleId(item.id)
  );
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
@keyframes levels-bubble-guest-emphasis-breathe {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.045); filter: brightness(1.1); }
}
.levels-bubble-guest-emphasis-breathe {
  animation: levels-bubble-guest-emphasis-breathe 3.8s ease-in-out infinite;
}
.levels-bubble-pop-in-guest {
  animation: levels-bubble-pop-in 0.9s cubic-bezier(0.34, 1.2, 0.64, 1) forwards;
}
.levels-bubble-pop-out-guest {
  animation: levels-bubble-pop-out 0.75s ease-out forwards;
}
`;

export function LevelsBubblesView({
  items,
  onBubbleOpen,
  hasMarketData = true,
  toneFilter = "all",
  showMaxPainBubbles = true,
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
  /** Market map page: bottom-right community chat floater over the canvas. */
  showChatFloater = false,
  /** Signed-out preview — per-bubble label policy (full / masked symbol + price). */
  guestPreview = false,
  guestBubbleLabels,
  /** Signed-out bubble tap — nudge sign-in card (does not open chart). */
  onGuestBubbleClick,
  /** Keep market bubbles under the chat drawer (z capped while pane is open). */
  suppressBubbleStacking = false,
}: {
  items: LevelsBubbleItem[];
  onBubbleOpen: (item: LevelsBubbleItem) => void;
  /** False when /api/freedombot/levels has not loaded yet or failed. */
  hasMarketData?: boolean;
  /** Map filter from toolbar (At Support, Near Support, …). */
  toneFilter?: BubbleMapFilter;
  /** When false, max-pain symbols render as neutral grey unless the AT MAX PAIN filter is active. */
  showMaxPainBubbles?: boolean;
  /** Search string from parent toolbar. */
  searchQuery?: string;
  /** When true, re-measure the container (e.g. after a hidden layout becomes visible). */
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
  showChatFloater?: boolean;
  guestPreview?: boolean;
  guestBubbleLabels?: ReadonlyMap<string, GuestBubbleLabel>;
  onGuestBubbleClick?: (item: LevelsBubbleItem) => void;
  suppressBubbleStacking?: boolean;
}) {
  const mapPaintFilter: BubbleMapFilter =
    guestPreview && showcaseEmphasis !== "all" ? showcaseEmphasis : toneFilter;

  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<PhysicsNode<LevelsBubbleItem>[]>([]);
  const chatNodeRef = useRef<PhysicsNode<LevelsBubbleItem> | null>(null);
  const chatElRef = useRef<HTMLDivElement | null>(null);
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
  const showMaxPainRef = useRef(showMaxPainBubbles);
  showMaxPainRef.current = showMaxPainBubbles;
  const toneFilterRef = useRef(toneFilter);
  toneFilterRef.current = toneFilter;
  const mapPaintFilterRef = useRef(mapPaintFilter);
  mapPaintFilterRef.current = mapPaintFilter;
  const layoutScaleRef = useRef(layoutScale);
  layoutScaleRef.current = layoutScale;
  const embedMobileLayoutRef = useRef(embedMobileLayout);
  embedMobileLayoutRef.current = embedMobileLayout;
  const showChatFloaterRef = useRef(showChatFloater);
  showChatFloaterRef.current = showChatFloater;
  const suppressBubbleStackingRef = useRef(suppressBubbleStacking);
  suppressBubbleStackingRef.current = suppressBubbleStacking;
  const guestPreviewRef = useRef(guestPreview);
  guestPreviewRef.current = guestPreview;
  const onGuestBubbleClickRef = useRef(onGuestBubbleClick);
  onGuestBubbleClickRef.current = onGuestBubbleClick;

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
      // MMI stays on the map with every tone filter (sentiment fixture).
      if (!isSpecialMapBubble(it) && !bubbleMatchesMapFilter(it.tone, toneFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        it.symbol.toUpperCase().includes(q) ||
        it.label.toUpperCase().includes(q) ||
        (it.kind === "mmi" && "MMI".includes(q)) ||
        (it.kind === "flash_sale" && ("FLASH".includes(q) || "SALE".includes(q) || "OFFER".includes(q))) ||
        (it.kind === "affiliate" &&
          ("REFER".includes(q) ||
            "EARN".includes(q) ||
            "CASH".includes(q) ||
            "AFFILIATE".includes(q)))
      );
    });
  }, [layoutItems, searchQuery, toneFilter]);

  const filteredIds = useMemo(
    () => filtered.map((it) => it.id).join("|"),
    [filtered],
  );

  const toneCounts = useMemo(
    () => countBubbleMapFilters(items.filter((it) => !isSpecialMapBubble(it))),
    [items],
  );

  const chatPin = useMemo(() => {
    if (!showChatFloater || size.w < 80 || size.h < 80) return null;
    const r = CHAT_MAP_BUBBLE_RADIUS * layoutScale;
    return {
      x: size.w - 18 - r,
      y: size.h - 14 - r,
      r,
    };
  }, [showChatFloater, size.w, size.h, layoutScale]);

  const paintTone = useCallback(
    (tone: BubbleTone) =>
      bubbleMapDisplayTone(tone, showMaxPainBubbles, mapPaintFilter),
    [showMaxPainBubbles, mapPaintFilter],
  );

  const showcaseActiveKey: BubbleToneSummaryKey | null =
    showcaseEmphasis === "IN_BULL" ||
    showcaseEmphasis === "NEAR_BULL" ||
    showcaseEmphasis === "IN_BEAR" ||
    showcaseEmphasis === "NEAR_BEAR"
      ? showcaseEmphasis
      : null;

  // Parent can force a remeasure when a previously hidden layout becomes visible.
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
    const delayMs = guestPreviewRef.current ? 550 : 400;
    const t = window.setTimeout(() => setLayoutReady(true), delayMs);
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
      const popDurationMs = guestPreviewRef.current ? 950 : 600;
      const t = window.setTimeout(() => {
        setPopClass((p) => {
          const copy = { ...p };
          for (const id of Object.keys(nextPop)) delete copy[id];
          return copy;
        });
      }, popDurationMs);
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
      n.r = layoutBubbleRadius(
        n.item.scope,
        paintTone(n.item.tone),
        scale,
        mobileEmbed,
        n.item.kind,
      );
      if (!existing.has(n.id)) {
        n.vx = 0;
        n.vy = 0;
      }
      // Preserved positions may come from a transient wrong-size layout (e.g.
      // measured mid-fade). Clamp into current bounds so a bubble can never get
      // stranded off-screen and "disappear".
      n.x = Math.max(n.r + 8, Math.min(size.w - n.r - 8, n.x));
      n.y = Math.max(n.r + 8, Math.min(size.h - n.r - 8, n.y));
      if (n.item.kind === "affiliate" || isAffiliateBubbleId(n.id)) {
        pinAffiliateMapBubble(n, size.w, size.h);
      }
    }

    const chatR = CHAT_MAP_BUBBLE_RADIUS * scale;
    if (showChatFloaterRef.current) {
      if (!chatNodeRef.current) {
        chatNodeRef.current = createChatMapBubbleNode(size.w, size.h, chatR);
      } else {
        chatNodeRef.current.r = chatR;
        pinChatMapBubble(chatNodeRef.current, size.w, size.h);
      }
    } else {
      chatNodeRef.current = null;
    }

    const settleAffiliatePin = () => {
      for (const n of nodesRef.current) {
        if (n.item.kind === "affiliate" || isAffiliateBubbleId(n.id)) {
          pinAffiliateMapBubble(n, size.w, size.h);
          // Nudge other bubbles off the pinned affiliate disc.
          repelNodesFromChatBubble(nodesRef.current, n, 8);
        }
      }
    };

    const settleChatCollisions = () => {
      const chat = chatNodeRef.current;
      if (!chat || !showChatFloaterRef.current) return;
      pinChatMapBubble(chat, size.w, size.h);
      repelNodesFromChatBubble(nodesRef.current, chat);
      clampNodesToBounds(nodesRef.current, size.w, size.h);
    };

    const applyChatPosition = () => {
      const chat = chatNodeRef.current;
      const el = chatElRef.current;
      if (!chat || !el || !showChatFloaterRef.current) return;
      const d = chat.r * 2;
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      el.style.transform = `translate3d(${chat.x - chat.r}px, ${chat.y - chat.r}px, 0)`;
      el.style.zIndex = "300";
    };

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
        const isSpecial = isSpecialMapBubble(n.item);
        const matched =
          !isSpecial &&
          emphasisActive &&
          bubbleMatchesMapFilter(n.item.tone, emphasis);
        const displayTone = bubbleMapDisplayTone(
          n.item.tone,
          showMaxPainRef.current,
          mapPaintFilterRef.current,
        );
        const targetR = (() => {
          const baseR = layoutBubbleRadius(
            n.item.scope,
            displayTone,
            scale,
            mobileEmbed,
            n.item.kind,
          );
          if (isSpecial) return baseR;
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
        n.r += (targetR - n.r) * (emphasisActive ? (guestPreviewRef.current ? 0.08 : 0.14) : guestPreviewRef.current ? 0.16 : 0.22);
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
        if (suppressBubbleStackingRef.current) {
          el.style.zIndex = "1";
          el.style.opacity = "1";
        } else if (isSpecial) {
          el.style.zIndex =
            n.item.kind === "flash_sale" || n.item.kind === "affiliate" ? "50" : "40";
          el.style.opacity = "1";
        } else if (matched) {
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
          el.style.zIndex = String(bubbleStackZIndex(n.item.scope, displayTone));
          el.style.opacity = "1";
        }
        el.style.transition = emphasisActive
          ? guestPreviewRef.current
            ? "opacity 0.95s ease, width 0.75s ease, height 0.75s ease"
            : "opacity 0.55s ease"
          : guestPreviewRef.current
            ? "opacity 0.7s ease, width 0.55s ease, height 0.55s ease"
            : "opacity 0.35s ease";
      }
      applyChatPosition();
    };

    settleAffiliatePin();
    settleChatCollisions();
    applyPositions();

    const loop = () => {
      physicsFrameRef.current += 1;
      const frame = physicsFrameRef.current;
      if (frame > 90 && physicsIntensity > 0) {
        const t = Math.min(1, (frame - 90) / 120);
        stepPhysics(nodesRef.current, size.w, size.h, (0.06 + t * 0.06) * physicsIntensity);
      }
      settleAffiliatePin();
      settleChatCollisions();
      applyPositions();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [filteredIds, size.w, size.h, layoutReady, physicsIntensity, layoutScale, embedMobileLayout, showMaxPainBubbles, mapPaintFilter, paintTone, showChatFloater, suppressBubbleStacking]);

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
            const isMmi = item.kind === "mmi" || isMmiBubbleId(item.id);
            const isFlash = item.kind === "flash_sale" || isFlashSaleBubbleId(item.id);
            const isAffiliate = item.kind === "affiliate" || isAffiliateBubbleId(item.id);
            const isSpecial = isMmi || isFlash || isAffiliate;
            const displayTone = paintTone(item.tone);
            const style = resolveBubbleVisual(item.scope, displayTone);
            const r = layoutBubbleRadius(
              item.scope,
              displayTone,
              layoutScale,
              embedMobileLayout,
              item.kind,
            );
            const fontMain = Math.max(
              10,
              Math.min(item.scope === "index" ? 17 : 14, r * 0.22),
            );
            const fontSub = Math.max(8, fontMain - 2);
            const pop = popClass[item.id];
            const popAnim =
              pop === "in"
                ? guestPreview
                  ? "levels-bubble-pop-in-guest"
                  : "levels-bubble-pop-in"
                : pop === "out"
                  ? guestPreview
                    ? "levels-bubble-pop-out-guest"
                    : "levels-bubble-pop-out"
                  : "";
            const mmiAccent = item.mmi
              ? MMI_ZONE_META[item.mmi.zone].color
              : "#f59e0b";
            const flashAccent = "#f59e0b";
            const affiliateAccent = "#fbbf24";
            const borderW = isSpecial ? (r < 50 ? 2 : 3) : style.borderWidth;
            const emphMatched =
              !isSpecial &&
              showcaseEmphasis !== "all" &&
              bubbleMatchesMapFilter(item.tone, showcaseEmphasis);
            const breatheAnim =
              !isFlash && !isAffiliate && showcaseSolo && emphMatched
                ? embedMobileLayout
                  ? "levels-bubble-showcase-breathe-mobile"
                  : "levels-bubble-showcase-breathe"
                : !isFlash &&
                    !isAffiliate &&
                    guestPreview &&
                    emphMatched &&
                    showcaseEmphasis !== "all"
                  ? "levels-bubble-guest-emphasis-breathe"
                  : "";
            const guestLabel = guestPreview ? guestBubbleLabels?.get(item.id) : undefined;
            const showLabel = guestPreview ? Boolean(guestLabel) : true;
            const displaySymbol = guestPreview ? guestLabel?.symbol : item.symbol;
            const mmiTitle =
              item.mmi != null
                ? `Market Mood Index ${formatMmiAria(item.mmi)} — Tickertape`
                : "Market Mood Index — Tickertape";
            const flashTitle = item.flashSale
              ? `Flash sale — upto ₹${item.flashSale.discountInr} off · ${item.flashSale.spotsLeft} spot${item.flashSale.spotsLeft === 1 ? "" : "s"} left`
              : "Flash sale";
            const affiliateTitle = "Refer & Earn Cash — up to 30% commission";
            return (
              <div
                key={item.id}
                ref={(el) => setBubbleRef(item.id, el)}
                className="absolute left-0 top-0 will-change-transform"
                style={{ width: r * 2, height: r * 2 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (guestPreview) {
                      onGuestBubbleClickRef.current?.(item);
                      return;
                    }
                    trackCtaClick(
                      isAffiliate
                        ? "bubble_open_affiliate"
                        : isFlash
                          ? "bubble_open_flash_sale"
                          : isMmi
                            ? "bubble_open_mmi"
                            : "bubble_open_chart",
                      {
                        label: item.label,
                        symbol: item.symbol,
                        scope: item.scope,
                      },
                    );
                    onBubbleOpen(item);
                  }}
                  className={`w-full h-full flex flex-col items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 pointer-events-auto ${popAnim} ${breatheAnim} ${
                    guestPreview
                      ? "cursor-pointer hover:scale-[1.04] active:scale-[0.97]"
                      : "hover:scale-[1.03] cursor-pointer"
                  }`}
                  style={{
                    background: isAffiliate
                      ? "radial-gradient(circle at 38% 32%, rgba(180,83,9,0.98) 0%, rgba(69,26,3,0.98) 55%, rgba(28,12,2,0.98) 100%)"
                      : isFlash
                        ? "radial-gradient(circle at 42% 38%, rgba(120,53,15,0.98) 0%, rgba(45,20,5,0.97) 72%)"
                        : isMmi
                          ? "radial-gradient(circle at 45% 40%, rgba(30,41,59,0.98) 0%, rgba(10,14,22,0.96) 70%)"
                          : style.fill,
                    border: isAffiliate
                      ? `${borderW}px solid ${affiliateAccent}`
                      : isFlash
                        ? `${borderW}px solid ${flashAccent}`
                        : isMmi
                          ? `${borderW}px solid ${mmiAccent}`
                          : `${borderW}px ${style.borderStyle} ${style.border}`,
                    boxShadow: isAffiliate
                      ? `0 0 16px ${affiliateAccent}66, inset 0 0 10px rgba(251,191,36,0.18)`
                      : isFlash
                        ? `0 0 26px ${flashAccent}66, inset 0 0 16px rgba(245,158,11,0.16)`
                        : isMmi
                          ? `0 0 22px ${mmiAccent}55, inset 0 0 14px rgba(245,158,11,0.08)`
                          : style.glow,
                    transition:
                      "box-shadow 0.45s ease, background 0.45s ease, border-color 0.45s ease, border-width 0.45s ease, transform 0.35s ease",
                  }}
                  aria-label={
                    isAffiliate
                      ? affiliateTitle
                      : isFlash
                        ? flashTitle
                        : isMmi
                          ? guestPreview
                            ? `${mmiTitle} — sign in for full map`
                            : mmiTitle
                          : guestPreview
                            ? showLabel
                              ? `${displaySymbol}${item.spot != null ? `, ${item.spot}` : ""} — sign in to open chart`
                              : "Sign in to view symbol and open chart"
                            : `${item.label}, ${displayTone === item.tone ? style.label : `At Max Pain (hidden) · ${style.label}`}`
                  }
                  title={
                    isAffiliate
                      ? `${affiliateTitle} — open program`
                      : isFlash
                        ? `${flashTitle} — claim offer`
                        : isMmi
                          ? guestPreview
                            ? "Market Mood Index — sign in for full map"
                            : "Market Mood Index (Tickertape) — open details"
                          : guestPreview
                            ? showLabel
                              ? `${displaySymbol}${item.spot != null ? ` · ${item.spot}` : ""} — sign in for full map`
                              : "Sign in to see full market map"
                            : `${item.label} · ${item.tone === "AT_POC" ? "At Max Pain" : style.label} — click for chart`
                  }
                >
                  {isAffiliate ? (
                    <LevelsAffiliateBubbleContent compact={r < 56} />
                  ) : isFlash && item.flashSale ? (
                    <LevelsFlashSaleBubbleContent
                      discountInr={item.flashSale.discountInr}
                      endsAt={item.flashSale.endsAt}
                      spotsLeft={item.flashSale.spotsLeft}
                      compact={r < 56}
                    />
                  ) : isMmi ? (
                    <LevelsMmiBubbleContent
                      mmi={item.mmi ?? null}
                      compact={r < 56}
                    />
                  ) : showLabel && displaySymbol ? (
                    <>
                      <span
                        className="font-black leading-none text-center px-1 truncate max-w-[92%] pointer-events-none"
                        style={{ fontSize: fontMain, color: style.textColor }}
                      >
                        {displaySymbol}
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
                    </>
                  ) : null}
                </button>
              </div>
            );
          })
        )}
        {chatPin ? <LevelsChatMapBubble bubbleRef={chatElRef} pin={chatPin} /> : null}
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
  atmIV?: number | null;
  volRegime?: PublicLevels["volRegime"];
  volRegimeReason?: string | null;
  daysToEarnings?: number | null;
  oi?: OiWallMomentum | null;
};

/** Synthetic index-sized bubble for Tickertape Market Mood Index. */
export function buildMmiBubbleItem(mmi: MmiSnapshot | null): LevelsBubbleItem {
  return {
    id: MMI_BUBBLE_ID,
    symbol: "MMI",
    label: "Market Mood Index",
    scope: "index",
    kind: "mmi",
    mmi,
    tone: "NEUTRAL",
    spot: mmi?.value ?? null,
    poc: null,
    bands: {
      spot: mmi?.value ?? null,
      bullLow: null,
      bullHigh: null,
      bearLow: null,
      bearHigh: null,
    },
    data: null,
    meetsActionableFilter: false,
  };
}

/** Synthetic promo bubble for the daily flash sale. */
export function buildFlashSaleBubbleItem(flashSale: FlashSalePublicState): LevelsBubbleItem {
  return {
    id: FLASH_SALE_BUBBLE_ID,
    symbol: "SALE",
    label: "Flash sale",
    scope: "index",
    kind: "flash_sale",
    flashSale,
    tone: "NEUTRAL",
    spot: flashSale.discountInr,
    poc: null,
    bands: {
      spot: flashSale.discountInr,
      bullLow: null,
      bullHigh: null,
      bearLow: null,
      bearHigh: null,
    },
    data: null,
    meetsActionableFilter: false,
  };
}

/** Synthetic gold-coin bubble for Refer & Earn Cash. */
export function buildAffiliateBubbleItem(): LevelsBubbleItem {
  return {
    id: AFFILIATE_BUBBLE_ID,
    symbol: "CASH",
    label: "Refer & Earn Cash",
    scope: "index",
    kind: "affiliate",
    tone: "NEUTRAL",
    spot: 30,
    poc: null,
    bands: {
      spot: 30,
      bullLow: null,
      bullHigh: null,
      bearLow: null,
      bearHigh: null,
    },
    data: null,
    meetsActionableFilter: false,
  };
}

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
    const tone = deriveBubbleDisplayTone(bands, true, actionable, poc, bandOffset, oi);
    out.push({
      id,
      symbol,
      label: it.label,
      scope: "index",
      tone,
      spot: bands.spot,
      poc,
      bands,
      data: it.data,
      meetsActionableFilter: actionable,
      atlasScore: computeLightAtlasScore(it.data, tone)?.composite ?? null,
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
    const tone = deriveBubbleDisplayTone(bands, scanned, actionable, poc, bandOffset, oi);
    out.push({
      id,
      symbol: sym,
      label: fnoCompanyName(sym) ?? st?.label ?? sym,
      scope: "stock",
      tone,
      spot: bands.spot,
      poc,
      bands,
      data: null,
      meetsActionableFilter: actionable,
      atlasScore: computeLightAtlasScore(stockLevels, tone)?.composite ?? null,
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
  const tone = deriveBubbleDisplayTone(bands, true, actionable, poc, bandOffset, oi);
  return {
    id: `${it.scope}-${it.symbol}`,
    symbol: it.symbol,
    label: it.label,
    scope: it.scope,
    tone,
    spot: bands.spot,
    poc: it.data?.poc ?? null,
    bands,
    data: it.data,
    meetsActionableFilter: actionable,
    atlasScore: computeLightAtlasScore(it.data, tone)?.composite ?? null,
  };
}
