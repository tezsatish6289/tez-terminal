"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { BUBBLE_TONE_STYLE, deriveBubbleTone } from "@/lib/zones/bubble-tone";
import type { ZoneBands } from "@/lib/zones/zone-status";

export interface LevelsBubbleItem {
  id: string;
  symbol: string;
  label: string;
  scope: "index" | "stock";
  tone: BubbleTone;
  spot: number | null;
  data: PublicLevels | null;
}

function bubbleRadius(scope: "index" | "stock", tone: BubbleTone): number {
  if (tone === "ILLIQUID") return scope === "index" ? 36 : 28;
  if (tone === "NEUTRAL") return scope === "index" ? 44 : 34;
  if (scope === "index") return tone === "IN_BULL" || tone === "IN_BEAR" ? 78 : 64;
  if (tone === "IN_BULL" || tone === "IN_BEAR") return 52;
  return 44;
}

interface PackedBubble {
  item: LevelsBubbleItem;
  x: number;
  y: number;
  r: number;
}

/** Golden-angle spiral + simple collision relaxation (Banter-style float). */
function packBubbles(
  items: LevelsBubbleItem[],
  width: number,
  height: number,
): PackedBubble[] {
  if (width < 40 || height < 40 || items.length === 0) return [];

  const sorted = [...items]
    .map((item) => ({ item, r: bubbleRadius(item.scope, item.tone) }))
    .sort((a, b) => b.r - a.r);

  const cx = width / 2;
  const cy = height / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const nodes = sorted.map(({ item, r }, i) => {
    const angle = i * golden;
    const ring = 6 + Math.sqrt(i + 1) * (Math.min(width, height) * 0.11);
    return {
      item,
      r,
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring,
    };
  });

  const pad = 4;
  for (let iter = 0; iter < 48; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = a.r + b.r + pad;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
    for (const n of nodes) {
      n.x = Math.max(n.r + 8, Math.min(width - n.r - 8, n.x));
      n.y = Math.max(n.r + 8, Math.min(height - n.r - 8, n.y));
    }
  }

  return nodes;
}

export function LevelsBubblesView({
  items,
  selectedId,
  onSelect,
  hideNeutral,
  onHideNeutralChange,
}: {
  items: LevelsBubbleItem[];
  selectedId: string | null;
  onSelect: (item: LevelsBubbleItem) => void;
  hideNeutral: boolean;
  onHideNeutralChange: (hide: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [query, setQuery] = useState("");

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
      if (hideNeutral && (it.tone === "NEUTRAL" || it.tone === "ILLIQUID")) return false;
      if (!q) return true;
      return (
        it.symbol.toUpperCase().includes(q) ||
        it.label.toUpperCase().includes(q)
      );
    });
  }, [items, query, hideNeutral]);

  const packed = useMemo(
    () => packBubbles(filtered, size.w, size.h),
    [filtered, size.w, size.h],
  );

  const counts = useMemo(() => {
    const m: Partial<Record<BubbleTone, number>> = {};
    for (const it of items) m[it.tone] = (m[it.tone] ?? 0) + 1;
    return m;
  }, [items]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2 px-0.5">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "#475569" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search index or symbol…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0",
            }}
          />
        </div>
        <label
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-pointer select-none"
          style={{ color: "#94a3b8" }}
        >
          <input
            type="checkbox"
            checked={hideNeutral}
            onChange={(e) => onHideNeutralChange(e.target.checked)}
            className="rounded border-slate-600"
          />
          Hide neutral / no data
        </label>
      </div>

      <div className="shrink-0 flex flex-wrap gap-2 mb-2 text-[9px] font-bold uppercase tracking-wide">
        {(["IN_BULL", "NEAR_BULL", "IN_BEAR", "NEAR_BEAR"] as const).map((tone) => {
          const s = BUBBLE_TONE_STYLE[tone];
          return (
            <span
              key={tone}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{
                color: s.border,
                backgroundColor: "rgba(0,0,0,0.35)",
                border: `1px solid ${s.border}`,
              }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.fill, boxShadow: s.glow }}
              />
              {s.label}
              <span style={{ color: "#64748b" }}>({counts[tone] ?? 0})</span>
            </span>
          );
        })}
        <span className="px-2 py-1" style={{ color: "#64748b" }}>
          {filtered.length} shown · {items.length} total
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-[280px] rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {packed.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs" style={{ color: "#64748b" }}>
              {items.length === 0 ? "No market data yet." : "No symbols match your filters."}
            </p>
          </div>
        ) : (
          packed.map(({ item, x, y, r }) => {
            const style = BUBBLE_TONE_STYLE[item.tone];
            const active = selectedId === item.id;
            const fontMain = Math.max(10, Math.min(15, r * 0.28));
            const fontSub = Math.max(8, fontMain - 2);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className="absolute flex flex-col items-center justify-center rounded-full transition-transform duration-200 hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                style={{
                  left: x - r,
                  top: y - r,
                  width: r * 2,
                  height: r * 2,
                  background: style.fill,
                  border: `2px solid ${active ? "#f8fafc" : style.border}`,
                  boxShadow: active
                    ? `${style.glow}, 0 0 0 3px rgba(248, 250, 252, 0.25)`
                    : style.glow,
                  transform: active ? "scale(1.06)" : undefined,
                  zIndex: active ? 20 : item.scope === "index" ? 12 : 8,
                }}
                aria-label={`${item.label}, ${style.label}`}
                title={`${item.label} · ${style.label}`}
              >
                {item.scope === "index" && (
                  <span
                    className="font-black uppercase tracking-widest opacity-70"
                    style={{ fontSize: Math.max(7, fontSub - 1), color: "#e2e8f0" }}
                  >
                    IDX
                  </span>
                )}
                <span
                  className="font-black leading-none text-center px-1 truncate max-w-[92%]"
                  style={{ fontSize: fontMain, color: "#f8fafc" }}
                >
                  {item.symbol}
                </span>
                {item.spot != null && (
                  <span
                    className="font-mono tabular-nums mt-0.5 opacity-90"
                    style={{ fontSize: fontSub, color: "#cbd5e1" }}
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

/** Build bubble rows from indices + stock aggregate list. */
export function buildLevelsBubbleItems(
  indices: { symbol?: string; label: string; data: PublicLevels | null }[],
  stocks: {
    symbol: string;
    label: string;
    spot: number | null;
    bullZoneLow: number | null;
    bullZoneHigh: number | null;
    bearZoneLow: number | null;
    bearZoneHigh: number | null;
  }[],
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
      tone: deriveBubbleTone(bands),
      spot: bands.spot,
      data: it.data,
    });
  }

  for (const st of stocks) {
    const bands: ZoneBands = {
      spot: st.spot,
      bullLow: st.bullZoneLow,
      bullHigh: st.bullZoneHigh,
      bearLow: st.bearZoneLow,
      bearHigh: st.bearZoneHigh,
    };
    out.push({
      id: `stock-${st.symbol}`,
      symbol: st.symbol,
      label: st.label,
      scope: "stock",
      tone: deriveBubbleTone(bands),
      spot: st.spot,
      data: null,
    });
  }

  return out;
}
