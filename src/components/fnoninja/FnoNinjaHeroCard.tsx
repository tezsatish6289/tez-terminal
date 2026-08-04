"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildLevelsBubbleItems,
  type LevelsBubbleItem,
  type StockBubbleSource,
} from "@/components/levels/LevelsBubblesView";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  BUBBLE_SHOWCASE_KEYS,
  bubbleShowcaseSteps,
  type BubbleShowcaseKey,
} from "@/lib/levels/bubble-showcase-cycle";
import { trackCtaClick } from "@/firebase/analytics";
import { fnoAnalyticsHref, fnoLoginHref } from "@/lib/fnoninja/paths";
import { FNO_MUTED } from "@/lib/fnoninja/theme";
import { countBubbleMapFilters } from "@/lib/zones/bubble-map-filter";
import type { BubbleTone } from "@/lib/zones/bubble-tone";

type IndexEntry = { symbol?: string; label: string; data: PublicLevels | null };
type StockListItem = StockBubbleSource;
type LevelsPayload = {
  indices?: IndexEntry[];
  stocks?: StockListItem[];
  fnoUniverse?: string[];
};

type HeroBubbleTone = BubbleShowcaseKey | "idx" | "neutral";
type Bubble = { s: string; px?: string; x: number; y: number; r: number; tone: HeroBubbleTone };
export type FilterKey = BubbleShowcaseKey;

const fmt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "—";

const SIGNAL_SLOTS = [
  { x: 78, y: 22, r: 44 },
  { x: 82, y: 40, r: 40 },
  { x: 88, y: 56, r: 38 },
  { x: 90, y: 74, r: 34 },
  { x: 74, y: 82, r: 36 },
  { x: 52, y: 84, r: 34 },
  { x: 34, y: 82, r: 40 },
  { x: 20, y: 70, r: 34 },
  { x: 16, y: 30, r: 38 },
  { x: 22, y: 18, r: 32 },
] as const;

const NEUTRAL_SLOTS = [
  { x: 46, y: 20, r: 28 },
  { x: 8, y: 52, r: 24 },
  { x: 6, y: 18, r: 22 },
  { x: 30, y: 12, r: 22 },
  { x: 62, y: 12, r: 22 },
  { x: 94, y: 12, r: 20 },
  { x: 94, y: 90, r: 22 },
  { x: 10, y: 90, r: 22 },
  { x: 42, y: 94, r: 20 },
] as const;

const INDEX_SLOTS: Record<string, { x: number; y: number; r: number }> = {
  NIFTY: { x: 62, y: 42, r: 78 },
  BANKNIFTY: { x: 40, y: 62, r: 72 },
  FINNIFTY: { x: 56, y: 68, r: 62 },
  MIDCPNIFTY: { x: 72, y: 62, r: 56 },
  NIFTYNXT50: { x: 28, y: 45, r: 60 },
};

const SHOWCASE_PRIORITY: Record<BubbleShowcaseKey, number> = {
  IN_BEAR: 0,
  IN_BULL: 1,
  NEAR_BEAR: 2,
  NEAR_BULL: 3,
};

const SHOWCASE_TONES = new Set<BubbleTone>(BUBBLE_SHOWCASE_KEYS);

function isShowcaseTone(tone: BubbleTone): tone is BubbleShowcaseKey {
  return SHOWCASE_TONES.has(tone);
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      Live
    </span>
  );
}

function StatChip({
  label,
  val,
  tone,
  active = false,
  href,
  cta,
}: {
  label: string;
  val: string;
  tone: "up" | "down" | "near-up" | "near-down";
  active?: boolean;
  href: string;
  cta: string;
}) {
  const num =
    tone === "up" || tone === "near-up"
      ? "text-emerald-400/85"
      : "text-rose-400/85";
  const activeGlow = active
    ? tone === "up" || tone === "near-up"
      ? "shadow-[0_0_16px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/40"
      : "shadow-[0_0_16px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/40"
    : "";

  return (
    <Link
      href={href}
      onClick={() => trackCtaClick("hero_stat_chip", { label, cta })}
      className={`relative block overflow-hidden rounded-xl border border-slate-700/50 bg-[#0c1220]/90 px-3 py-3 text-slate-300 transition-all duration-500 hover:border-slate-500/70 hover:bg-[#101828] cursor-pointer ${activeGlow}`}
    >
      <div className={`text-[26px] font-black leading-none tabular-nums tracking-tight ${num}`}>
        {val}
      </div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
    </Link>
  );
}

/** Same classification pipeline as /fnoninja/levels. */
function useLevelsBubbleItems(payload: LevelsPayload | null): LevelsBubbleItem[] {
  return useMemo(() => {
    if (!payload) return [];
    const stockBySymbol = new Map<string, StockBubbleSource>();
    for (const s of payload.stocks ?? []) stockBySymbol.set(s.symbol, s);
    return buildLevelsBubbleItems(
      payload.indices ?? [],
      stockBySymbol,
      payload.fnoUniverse,
    );
  }, [payload]);
}

function MarketMap({
  bubbleItems,
  activeFilter,
  loading,
}: {
  bubbleItems: LevelsBubbleItem[];
  activeFilter: FilterKey;
  loading: boolean;
}) {
  const bubbles = useMemo<Bubble[]>(() => {
    const out: Bubble[] = [];
    const used = new Set<string>();

    for (const it of bubbleItems) {
      if (it.scope !== "index") continue;
      const slot = INDEX_SLOTS[it.symbol];
      if (!slot) continue;
      used.add(it.symbol);
      out.push({
        s: it.symbol,
        px: fmt(it.spot),
        ...slot,
        tone: isShowcaseTone(it.tone) ? it.tone : "idx",
      });
    }

    const signals = bubbleItems
      .filter((it) => it.scope === "stock" && isShowcaseTone(it.tone))
      .sort((a, b) => {
        const pa = SHOWCASE_PRIORITY[a.tone as BubbleShowcaseKey] ?? 9;
        const pb = SHOWCASE_PRIORITY[b.tone as BubbleShowcaseKey] ?? 9;
        return pa - pb || a.symbol.localeCompare(b.symbol);
      });

    signals.slice(0, SIGNAL_SLOTS.length).forEach((z, i) => {
      const slot = SIGNAL_SLOTS[i];
      used.add(z.symbol);
      out.push({
        s: z.symbol,
        px: fmt(z.spot),
        x: slot.x,
        y: slot.y,
        r: slot.r,
        tone: z.tone as BubbleShowcaseKey,
      });
    });

    const neutrals = bubbleItems.filter(
      (it) => it.scope === "stock" && !used.has(it.symbol) && !isShowcaseTone(it.tone),
    );
    NEUTRAL_SLOTS.forEach((slot, i) => {
      const item = neutrals[i];
      if (!item) return;
      out.push({ s: item.symbol, x: slot.x, y: slot.y, r: slot.r, tone: "neutral" });
    });

    return out;
  }, [bubbleItems]);

  const signalCount = bubbleItems.filter((it) => isShowcaseTone(it.tone)).length;

  const styleFor = (b: Bubble) => {
    const isActive = b.tone === activeFilter;
    switch (b.tone) {
      case "IN_BULL":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#10b981]/40 text-[#34d399]/85 ${
          isActive ? "shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-[#10b981]/55" : ""
        }`;
      case "NEAR_BULL":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#10b981]/30 text-[#6ee7b7]/85 ${
          isActive ? "shadow-[0_0_16px_rgba(16,185,129,0.12)] ring-[#10b981]/45" : ""
        }`;
      case "IN_BEAR":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#f43f5e]/40 text-[#fb7185]/85 ${
          isActive ? "shadow-[0_0_20px_rgba(244,63,94,0.15)] ring-[#f43f5e]/55" : ""
        }`;
      case "NEAR_BEAR":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#f43f5e]/30 text-[#fda4af]/85 ${
          isActive ? "shadow-[0_0_16px_rgba(244,63,94,0.12)] ring-[#f43f5e]/45" : ""
        }`;
      case "idx":
        return "bg-[#131b2e]/70 ring-[1px] ring-white/[0.12] text-white/70";
      default:
        return "bg-[#131b2e]/45 ring-[1px] ring-white/[0.07] text-white/30";
    }
  };

  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-2xl border border-[rgba(90,140,220,0.18)] bg-[#080f1e]/90">
      <div className="absolute inset-0 fno-grid-bg opacity-20" />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-[rgba(90,140,220,0.18)] bg-[#0d1830]/80 px-4 py-3">
        <div className="flex items-center gap-2 text-[13px]" style={{ color: FNO_MUTED }}>
          <span className="font-semibold tracking-tight text-white">Market map</span>
          <span className="opacity-70">· NSE F&amp;O · scanning 200+ symbols</span>
        </div>
        <LiveBadge />
      </div>

      {loading ? (
        <div className="absolute inset-0 grid place-items-center text-[12px]" style={{ color: FNO_MUTED }}>
          Loading live market map…
        </div>
      ) : (
        bubbles.map((b) => (
          <div
            key={`${b.s}-${b.x}-${b.y}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
          >
            <div
              className={`grid place-items-center rounded-full transition-all duration-700 ${styleFor(b)}`}
              style={{ width: b.r * 2, height: b.r * 2 }}
            >
              <span
                className={`text-center font-semibold tracking-tight leading-tight ${
                  b.r >= 60 ? "text-sm" : b.r >= 40 ? "text-[11px]" : "text-[9px]"
                }`}
              >
                {b.s}
                {b.px && b.r >= 40 && (
                  <span className="mt-0.5 block text-[9px] font-normal opacity-75">{b.px}</span>
                )}
              </span>
            </div>
          </div>
        ))
      )}

      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-4 border-t border-[rgba(90,140,220,0.18)] bg-[#0d1830]/70 px-4 py-2.5 text-[12px]"
        style={{ color: FNO_MUTED }}
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          At Support
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/50" />
          Near Support
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          At Resistance
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400/50" />
          Near Resistance
        </span>
        <span className="ml-auto">
          {signalCount} symbol{signalCount === 1 ? "" : "s"} in play
        </span>
      </div>
    </div>
  );
}

export function useHeroLevels(): LevelsPayload | null {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as LevelsPayload;
        if (alive) setPayload(json);
      } catch {
        /* keep last */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return payload;
}

/** Cycle At/Near chips that have symbols — same order as /levels showcase. */
export function useCyclingHeroFilter(
  bubbleItems: LevelsBubbleItem[],
  intervalMs = 6500,
): FilterKey {
  const steps = useMemo(() => {
    const live = bubbleShowcaseSteps(bubbleItems);
    return live.length > 0 ? live : [...BUBBLE_SHOWCASE_KEYS];
  }, [bubbleItems]);
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [steps.join("|")]);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % steps.length), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, steps]);

  return steps[i % steps.length] ?? "IN_BULL";
}

/** Live market map + zone stat chips — same tone logic as /fnoninja/levels. */
export function FnoNinjaHeroCard({
  payload,
  activeFilter,
}: {
  payload: LevelsPayload | null;
  activeFilter: FilterKey;
}) {
  const pathname = usePathname();
  const bubbleItems = useLevelsBubbleItems(payload);
  const counts = useMemo(() => countBubbleMapFilters(bubbleItems), [bubbleItems]);
  const levelsHref = fnoAnalyticsHref(pathname);
  const loginHrefFor = (cta: string) =>
    fnoLoginHref(pathname, levelsHref, { src: "landing", cta });

  return (
    <div className="relative flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        <StatChip
          label="At Support"
          val={String(counts.IN_BULL)}
          tone="up"
          active={activeFilter === "IN_BULL"}
          cta="hero_at_support"
          href={loginHrefFor("hero_at_support")}
        />
        <StatChip
          label="Near Support"
          val={String(counts.NEAR_BULL)}
          tone="near-up"
          active={activeFilter === "NEAR_BULL"}
          cta="hero_near_support"
          href={loginHrefFor("hero_near_support")}
        />
        <StatChip
          label="At Resistance"
          val={String(counts.IN_BEAR)}
          tone="down"
          active={activeFilter === "IN_BEAR"}
          cta="hero_at_resistance"
          href={loginHrefFor("hero_at_resistance")}
        />
        <StatChip
          label="Near Resistance"
          val={String(counts.NEAR_BEAR)}
          tone="near-down"
          active={activeFilter === "NEAR_BEAR"}
          cta="hero_near_resistance"
          href={loginHrefFor("hero_near_resistance")}
        />
      </div>
      <MarketMap
        bubbleItems={bubbleItems}
        activeFilter={activeFilter}
        loading={payload == null}
      />
    </div>
  );
}

export function useHeroBubbleItems(payload: LevelsPayload | null): LevelsBubbleItem[] {
  return useLevelsBubbleItems(payload);
}
