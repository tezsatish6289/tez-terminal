"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  bubbleRadius,
  createPhysicsNodes,
  isInZoneTone,
  stepPhysics,
  type PhysicsNode,
} from "@/lib/levels/bubble-physics";
import { LEVELS_TOOLBAR_CHIP_HEIGHT } from "@/components/levels/LevelsSlideshowCta";
import {
  BLACKBOARD_CHALK,
  BLACKBOARD_CHALK_DIM,
  BLACKBOARD_FIELD_BG,
  BLACKBOARD_FIELD_BORDER,
} from "@/lib/levels/cta-blackboard";
import { BUBBLE_TONE_STYLE, deriveBubbleTone, type BubbleTone } from "@/lib/zones/bubble-tone";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import { FNO_UNIVERSE_ALPHA } from "@/lib/nse/fno-universe";
import type { ZoneBands } from "@/lib/zones/zone-status";

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
`;

function BubbleChip({
  tone,
  count,
}: {
  tone: "IN_BULL" | "NEAR_BULL" | "IN_BEAR" | "NEAR_BEAR" | "UNSCANNED";
  count: number;
}) {
  const s = BUBBLE_TONE_STYLE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-md shrink-0`}
      style={{
        color: s.border,
        backgroundColor: "rgba(0,0,0,0.35)",
        border: `${s.borderStyle === "dashed" ? "1px dashed" : "1px solid"} ${s.border}`,
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{
          background: s.solid ? s.fill : "transparent",
          border: `${s.borderStyle === "dashed" ? "1px dashed" : "1px solid"} ${s.border}`,
          boxShadow: s.glow,
        }}
      />
      {s.label}
      <span style={{ color: "#64748b" }}>({count})</span>
    </span>
  );
}

export function LevelsBubblesView({
  items,
  onBubbleOpen,
  hideNeutral,
  onHideNeutralChange,
  headerActions,
}: {
  items: LevelsBubbleItem[];
  onBubbleOpen: (item: LevelsBubbleItem) => void;
  hideNeutral: boolean;
  onHideNeutralChange: (hide: boolean) => void;
  /** Slideshow toggle — same toolbar row as legend + search. */
  headerActions?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<PhysicsNode<LevelsBubbleItem>[]>([]);
  const elRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const prevTonesRef = useRef<Map<string, BubbleTone>>(new Map());
  const rafRef = useRef<number>(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [query, setQuery] = useState("");
  const [popClass, setPopClass] = useState<Record<string, "in" | "out">>({});

  const syncSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  useEffect(() => {
    syncSize();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncSize]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return items.filter((it) => {
      if (
        hideNeutral &&
        (it.tone === "NEUTRAL" || it.tone === "ILLIQUID" || it.tone === "UNSCANNED")
      ) {
        return false;
      }
      if (!q) return true;
      return (
        it.symbol.toUpperCase().includes(q) ||
        it.label.toUpperCase().includes(q)
      );
    });
  }, [items, query, hideNeutral]);

  const filteredIds = useMemo(
    () => filtered.map((it) => it.id).join("|"),
    [filtered],
  );

  const counts = useMemo(() => {
    const m: Partial<Record<BubbleTone, number>> = {};
    for (const it of items) m[it.tone] = (m[it.tone] ?? 0) + 1;
    return m;
  }, [items]);

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
    if (size.w < 40 || size.h < 40) return;

    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = createPhysicsNodes(filtered, size.w, size.h, existing);

    for (const n of nodesRef.current) {
      n.r = bubbleRadius(n.item.scope, n.item.tone);
    }

    const applyPositions = () => {
      for (const n of nodesRef.current) {
        const el = elRefs.current.get(n.id);
        if (!el) continue;
        el.style.left = `${n.x - n.r}px`;
        el.style.top = `${n.y - n.r}px`;
        el.style.width = `${n.r * 2}px`;
        el.style.height = `${n.r * 2}px`;
        el.style.zIndex = String(n.item.scope === "index" ? 12 : 8);
      }
    };

    applyPositions();

    const loop = () => {
      stepPhysics(nodesRef.current, size.w, size.h);
      applyPositions();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [filteredIds, size.w, size.h, filtered]);

  const setBubbleRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) elRefs.current.set(id, el);
    else elRefs.current.delete(id);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <style dangerouslySetInnerHTML={{ __html: BUBBLE_ANIM_CSS }} />

      <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-2 mb-2 px-0.5">
        <div className="relative w-full sm:w-auto sm:min-w-[11rem] sm:max-w-[14rem] flex-1 sm:flex-none order-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
            style={{ color: BLACKBOARD_CHALK_DIM }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className={`w-full pl-8 pr-3 ${LEVELS_TOOLBAR_CHIP_HEIGHT} rounded-full text-xs outline-none placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-slate-400/30`}
            style={{
              backgroundColor: BLACKBOARD_FIELD_BG,
              border: BLACKBOARD_FIELD_BORDER,
              color: BLACKBOARD_CHALK,
            }}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label
            className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider cursor-pointer select-none"
            style={{ color: "#94a3b8" }}
          >
            <input
              type="checkbox"
              checked={hideNeutral}
              onChange={(e) => onHideNeutralChange(e.target.checked)}
              className="rounded border-slate-600"
            />
            Hide unscanned
          </label>
          <span
            className="text-[9px] font-bold uppercase tracking-wide shrink-0"
            style={{ color: "#64748b" }}
          >
            {filtered.length} shown · {items.length} total
          </span>
        </div>

        <BubbleChip tone="IN_BULL" count={counts.IN_BULL ?? 0} />
        <BubbleChip tone="NEAR_BULL" count={counts.NEAR_BULL ?? 0} />
        <BubbleChip tone="IN_BEAR" count={counts.IN_BEAR ?? 0} />
        <BubbleChip tone="NEAR_BEAR" count={counts.NEAR_BEAR ?? 0} />
        <BubbleChip tone="UNSCANNED" count={counts.UNSCANNED ?? 0} />

        {headerActions ? (
          <div className="ml-auto flex items-center shrink-0">{headerActions}</div>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {filtered.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs" style={{ color: "#64748b" }}>
              {items.length === 0 ? "No market data yet." : "No symbols match your filters."}
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const style = BUBBLE_TONE_STYLE[item.tone];
            const r = bubbleRadius(item.scope, item.tone);
            const fontMain = Math.max(10, Math.min(15, r * 0.28));
            const fontSub = Math.max(8, fontMain - 2);
            const pop = popClass[item.id];
            const popAnim =
              pop === "in"
                ? "levels-bubble-pop-in"
                : pop === "out"
                  ? "levels-bubble-pop-out"
                  : "";

            return (
              <button
                key={item.id}
                ref={(el) => setBubbleRef(item.id, el)}
                type="button"
                onClick={() => onBubbleOpen(item)}
                className={`absolute flex flex-col items-center justify-center rounded-full hover:scale-[1.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer will-change-transform ${popAnim}`}
                style={{
                  left: 0,
                  top: 0,
                  width: r * 2,
                  height: r * 2,
                  background: style.fill,
                  border: `${style.borderWidth}px ${style.borderStyle} ${style.border}`,
                  boxShadow: style.glow,
                  transition: "box-shadow 0.35s ease, background 0.35s ease, border-color 0.35s ease",
                }}
                aria-label={`${item.label}, ${style.label}`}
                title={`${item.label} · ${style.label} — click for chart`}
              >
                {item.scope === "index" && (
                  <span
                    className="font-black uppercase tracking-widest opacity-70 pointer-events-none"
                    style={{ fontSize: Math.max(7, fontSub - 1), color: "#e2e8f0" }}
                  >
                    IDX
                  </span>
                )}
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
  computedAt?: string | null;
};

/** Indices + full F&O universe merged with cron aggregate. */
export function buildLevelsBubbleItems(
  indices: { symbol?: string; label: string; data: PublicLevels | null }[],
  stockBySymbol: Map<string, StockBubbleSource>,
): LevelsBubbleItem[] {
  const out: LevelsBubbleItem[] = [];

  for (const it of indices) {
    const symbol = (it.symbol ?? it.label).toUpperCase();
    const bands: ZoneBands = {
      spot: it.data?.spot ?? null,
      bullLow: it.data?.bullLow ?? null,
      bullHigh: it.data?.bullHigh ?? null,
      bearLow: it.data?.bearLow ?? null,
      bearHigh: it.data?.bearHigh ?? null,
    };
    out.push({
      id: `index-${symbol}`,
      symbol,
      label: it.label,
      scope: "index",
      tone: deriveBubbleTone(bands, true),
      spot: bands.spot,
      poc: it.data?.poc ?? null,
      bands,
      data: it.data,
    });
  }

  for (const sym of FNO_UNIVERSE_ALPHA) {
    const st = stockBySymbol.get(sym);
    const scanned = Boolean(st);
    const bands: ZoneBands = {
      spot: st?.spot ?? null,
      bullLow: st?.bullZoneLow ?? null,
      bullHigh: st?.bullZoneHigh ?? null,
      bearLow: st?.bearZoneLow ?? null,
      bearHigh: st?.bearZoneHigh ?? null,
    };
    out.push({
      id: `stock-${sym}`,
      symbol: sym,
      label: fnoCompanyName(sym) ?? st?.label ?? sym,
      scope: "stock",
      tone: deriveBubbleTone(bands, scanned),
      spot: bands.spot,
      poc: st?.maxPain ?? null,
      bands,
      data: null,
    });
  }

  return out;
}
