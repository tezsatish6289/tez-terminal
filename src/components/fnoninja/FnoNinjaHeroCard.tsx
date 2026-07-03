"use client";

import { useEffect, useMemo, useState } from "react";
import { FNO_MUTED } from "@/lib/fnoninja/theme";

type Status = "IN_BULL" | "IN_BEAR" | "NEAR" | "NEUTRAL";
type LevelsInZone = { scope: "stock" | "index"; symbol: string; status: Status; spot: number };
type IndexEntry = { symbol: string; data?: { spot?: number } };
type LevelsPayload = {
  indices?: IndexEntry[];
  inZone?: LevelsInZone[];
  fnoUniverse?: string[];
};

type BubbleTone = "at-r" | "near-r" | "at-s" | "near-s" | "idx" | "neutral";
type Bubble = { s: string; px?: string; x: number; y: number; r: number; tone: BubbleTone };
type FilterKey = "at-s" | "at-r" | "near-r";

const fmt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "—";

const toneForStatus = (s: Status): BubbleTone =>
  s === "IN_BULL" ? "at-s" : s === "IN_BEAR" ? "at-r" : s === "NEAR" ? "near-r" : "neutral";

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
}: {
  label: string;
  val: string;
  tone: "up" | "down" | "warn" | "mute";
  active?: boolean;
}) {
  const num =
    tone === "up"
      ? "text-emerald-400/85"
      : tone === "down"
        ? "text-rose-400/85"
        : tone === "warn"
          ? "text-amber-400/85"
          : "text-slate-400";
  const activeGlow = active
    ? tone === "up"
      ? "shadow-[0_0_16px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/40"
      : tone === "down"
        ? "shadow-[0_0_16px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/40"
        : tone === "warn"
          ? "shadow-[0_0_16px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/40"
          : "ring-1 ring-white/15"
    : "";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-700/50 bg-[#0c1220]/90 px-3 py-3 text-slate-300 transition-all duration-500 ${activeGlow}`}
    >
      <div className={`text-[26px] font-black leading-none tabular-nums tracking-tight ${num}`}>
        {val}
      </div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function MarketMap({
  payload,
  activeFilter,
}: {
  payload: LevelsPayload | null;
  activeFilter: FilterKey;
}) {
  const bubbles = useMemo<Bubble[]>(() => {
    const out: Bubble[] = [];
    for (const idx of payload?.indices ?? []) {
      const slot = INDEX_SLOTS[idx.symbol];
      if (!slot) continue;
      out.push({ s: idx.symbol, px: fmt(idx.data?.spot), ...slot, tone: "idx" });
    }

    const zoneStocks = (payload?.inZone ?? []).filter((z) => z.scope === "stock");
    const priority: Record<Status, number> = {
      IN_BEAR: 0,
      IN_BULL: 1,
      NEAR: 2,
      NEUTRAL: 3,
    };
    const sorted = [...zoneStocks].sort((a, b) => priority[a.status] - priority[b.status]);
    const used = new Set<string>();
    sorted.slice(0, SIGNAL_SLOTS.length).forEach((z, i) => {
      const slot = SIGNAL_SLOTS[i];
      used.add(z.symbol);
      out.push({
        s: z.symbol,
        px: fmt(z.spot),
        x: slot.x,
        y: slot.y,
        r: slot.r,
        tone: toneForStatus(z.status),
      });
    });

    const neutrals = (payload?.fnoUniverse ?? []).filter((s) => !used.has(s) && !INDEX_SLOTS[s]);
    NEUTRAL_SLOTS.forEach((slot, i) => {
      const sym = neutrals[i];
      if (!sym) return;
      out.push({ s: sym, x: slot.x, y: slot.y, r: slot.r, tone: "neutral" });
    });

    return out;
  }, [payload]);

  const signalCount = bubbles.filter((b) =>
    (["at-s", "at-r", "near-r", "near-s"] as BubbleTone[]).includes(b.tone),
  ).length;

  const styleFor = (b: Bubble) => {
    const isActive = b.tone === activeFilter;
    switch (b.tone) {
      case "at-s":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#10b981]/40 text-[#34d399]/85 ${
          isActive ? "shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-[#10b981]/55" : ""
        }`;
      case "at-r":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#f43f5e]/40 text-[#fb7185]/85 ${
          isActive ? "shadow-[0_0_20px_rgba(244,63,94,0.15)] ring-[#f43f5e]/55" : ""
        }`;
      case "near-r":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#f59e0b]/40 text-[#fbbf24]/85 ${
          isActive ? "shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-[#f59e0b]/55" : ""
        }`;
      case "near-s":
        return `bg-[#131b2e]/80 ring-[1px] ring-[#10b981]/30 text-[#34d399]/85 ${
          isActive ? "shadow-[0_0_20px_rgba(16,185,129,0.10)]" : ""
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

      {payload == null ? (
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
        className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-5 border-t border-[rgba(90,140,220,0.18)] bg-[#0d1830]/70 px-4 py-2.5 text-[12px]"
        style={{ color: FNO_MUTED }}
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          At Support
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Near R/S
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          At Resistance
        </span>
        <span className="ml-auto">
          {signalCount} stock{signalCount === 1 ? "" : "s"} in play
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

export function useCyclingHeroFilter(intervalMs = 6500): FilterKey {
  const order = useMemo<FilterKey[]>(() => ["at-s", "at-r", "near-r"], []);
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % order.length), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, order.length]);
  return order[i];
}

/** Live market map + zone stat chips (Lovable landing refresh). */
export function FnoNinjaHeroCard({
  payload,
  activeFilter,
}: {
  payload: LevelsPayload | null;
  activeFilter: FilterKey;
}) {
  const counts = useMemo(() => {
    const stocks = (payload?.inZone ?? []).filter((z) => z.scope === "stock");
    let atS = 0;
    let atR = 0;
    let near = 0;
    stocks.forEach((s) => {
      if (s.status === "IN_BULL") atS++;
      else if (s.status === "IN_BEAR") atR++;
      else if (s.status === "NEAR") near++;
    });
    return { atS, atR, near };
  }, [payload]);

  return (
    <div className="relative flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        <StatChip label="At Support" val={String(counts.atS)} tone="up" active={activeFilter === "at-s"} />
        <StatChip label="Near Support" val="—" tone="mute" />
        <StatChip
          label="At Resistance"
          val={String(counts.atR)}
          tone="down"
          active={activeFilter === "at-r"}
        />
        <StatChip
          label="Near Level"
          val={String(counts.near)}
          tone="warn"
          active={activeFilter === "near-r"}
        />
      </div>
      <MarketMap payload={payload} activeFilter={activeFilter} />
    </div>
  );
}
