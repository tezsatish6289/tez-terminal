"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  FNO_BG_CANVAS,
  FNO_CARD_BG,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

const EMBED_SRC = "/embed/levels-bubbles";

interface IndexRow {
  symbol?: string;
  label: string;
  data: PublicLevels | null;
}

interface LevelsPayload {
  indices: IndexRow[];
  stocks: unknown[];
  fnoUniverse?: string[];
  updatedAt?: string;
}

interface HeroStats {
  totalOi: string;
  pcr: string;
  maxPain: string;
}

function fmtMaxPain(p: number): string {
  return Math.round(p).toLocaleString("en-IN");
}

function fmtOiLakh(contracts: number): string {
  const lakh = contracts / 100_000;
  if (lakh >= 100) return `₹${(lakh / 100).toFixed(2)}L Cr`;
  if (lakh >= 1) return `₹${lakh.toFixed(2)}L Cr`;
  return contracts.toLocaleString("en-IN");
}

function statsFromNifty(data: PublicLevels | null | undefined): HeroStats {
  if (!data) {
    return { totalOi: "—", pcr: "—", maxPain: "—" };
  }
  const put = data.putClusterSize ?? 0;
  const call = data.callClusterSize ?? 0;
  const totalOi =
    put > 0 || call > 0 ? fmtOiLakh(put + call) : "—";
  const pcr = put > 0 && call > 0 ? (put / call).toFixed(2) : "—";
  const maxPain = data.poc != null ? fmtMaxPain(data.poc) : "—";
  return { totalOi, pcr, maxPain };
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
        {label}
      </p>
      <p
        className="mt-0.5 text-sm sm:text-base font-black font-mono tabular-nums tracking-tight truncate"
        style={{ color: "#f0f4ff" }}
      >
        {value}
      </p>
    </div>
  );
}

/** Unified first-fold card — copy left, live bubble map right. */
export function FnoNinjaHeroCard() {
  const [stats, setStats] = useState<HeroStats>({ totalOi: "—", pcr: "—", maxPain: "—" });

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      const json = (await res.json()) as LevelsPayload;
      const nifty =
        json.indices?.find((i) => i.symbol === "NIFTY")?.data ??
        json.indices?.[0]?.data;
      setStats(statsFromNifty(nifty));
    } catch {
      /* keep last-good / dashes */
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const id = window.setInterval(loadStats, 60_000);
    return () => window.clearInterval(id);
  }, [loadStats]);

  return (
    <div
      className="rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col lg:flex-row min-h-0 shadow-2xl"
      style={{
        border: "1px solid rgba(90,140,220,0.2)",
        backgroundColor: FNO_CARD_BG,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(90,140,220,0.06)",
      }}
    >
      {/* Left — headline, live badge, stats, CTA */}
      <div className="flex flex-col justify-center gap-5 sm:gap-6 p-5 sm:p-7 lg:p-8 xl:p-10 lg:w-[42%] lg:shrink-0 lg:border-r border-white/[0.06]">
        <div className="space-y-4 sm:space-y-5">
          <h1 className="text-[1.65rem] sm:text-3xl lg:text-[2rem] xl:text-[2.35rem] font-black tracking-tight leading-[1.1] text-white">
            See Where the Smart Money Is Positioned
          </h1>

          <p className="text-sm sm:text-[15px] leading-relaxed" style={{ color: FNO_MUTED }}>
            Turn thousands of option-chain data points into clear support, resistance, and market
            structure across the entire NSE F&amp;O universe.
          </p>

          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 w-fit"
            style={{
              backgroundColor: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.28)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ backgroundColor: "#22c55e" }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
            </span>
            <span className="text-[11px] sm:text-xs font-semibold" style={{ color: "#86efac" }}>
              <span className="font-black uppercase tracking-wider" style={{ color: "#4ade80" }}>
                Live
              </span>
              {" · "}
              Real-time data for 193+ F&amp;O Stocks &amp; Indices
            </span>
          </div>
        </div>

        <div
          className="flex items-stretch gap-0 rounded-xl overflow-hidden"
          style={{
            border: "1px solid rgba(90,140,220,0.14)",
            backgroundColor: "rgba(8,15,30,0.55)",
          }}
        >
          <StatCell label="Total OI" value={stats.totalOi} />
          <div className="w-px shrink-0 self-stretch bg-white/[0.08]" aria-hidden />
          <StatCell label="PCR" value={stats.pcr} />
          <div className="w-px shrink-0 self-stretch bg-white/[0.08]" aria-hidden />
          <StatCell label="Max Pain" value={stats.maxPain} />
        </div>

        <div className="space-y-2.5">
          <FnoNinjaCtaLink className="w-full">Explore live market map</FnoNinjaCtaLink>
          <p className="text-[10px] sm:text-[11px]" style={{ color: "#334155" }}>
            Informational only · Not investment advice
          </p>
        </div>
      </div>

      {/* Right — map preview with product chrome */}
      <div className="flex flex-col min-h-[min(52vh,420px)] sm:min-h-[380px] lg:min-h-0 lg:flex-1 min-w-0">
        <div
          className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b"
          style={{
            borderColor: "rgba(90,140,220,0.12)",
            backgroundColor: "rgba(8,15,30,0.92)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{
                color: "#93c5fd",
                backgroundColor: "rgba(37,99,235,0.18)",
                border: "1px solid rgba(96,165,250,0.25)",
              }}
            >
              NSE F&amp;O
            </span>
            <span className="text-[10px] font-mono truncate" style={{ color: "#64748b" }}>
              30%
            </span>
          </div>
          <span
            className="shrink-0 rounded-md px-2.5 py-1 text-[9px] font-mono font-medium truncate max-w-[48%]"
            style={{
              color: "#94a3b8",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            NSE-FNO-MARKET-MAP
          </span>
        </div>

        <div
          className="shrink-0 hidden sm:flex items-center gap-2 px-3 sm:px-4 py-2 border-b flex-wrap"
          style={{
            borderColor: "rgba(90,140,220,0.08)",
            backgroundColor: "rgba(8,15,30,0.75)",
          }}
        >
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
            {(["1D", "1W", "1M"] as const).map((t, i) => (
              <span
                key={t}
                className="rounded-md px-2.5 py-1 text-[10px] font-semibold"
                style={{
                  color: i === 0 ? "#bfdbfe" : "#64748b",
                  backgroundColor: i === 0 ? "rgba(37,99,235,0.22)" : "transparent",
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <span
            className="rounded-lg px-2.5 py-1 text-[10px] font-semibold"
            style={{
              color: "#94a3b8",
              border: "1px solid rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.03)",
            }}
          >
            Sector ▾
          </span>
          <span
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px]"
            style={{
              color: "#64748b",
              border: "1px solid rgba(255,255,255,0.06)",
              backgroundColor: "rgba(0,0,0,0.25)",
            }}
          >
            <Search className="h-3 w-3 shrink-0" />
            Search
          </span>
        </div>

        <div className="relative flex-1 min-h-[240px]" style={{ backgroundColor: FNO_BG_CANVAS }}>
          <iframe
            src={EMBED_SRC}
            title="NSE F&O market bubble map"
            className="absolute inset-0 w-full h-full border-0"
            loading="lazy"
            scrolling="no"
            referrerPolicy="same-origin"
          />
          <div
            className="pointer-events-none absolute bottom-2 right-2 sm:bottom-3 sm:right-3 rounded-md px-2 py-1 text-[9px] font-medium"
            style={{
              color: "#94a3b8",
              backgroundColor: "rgba(8,15,30,0.82)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Bubble Size = OI · Color = Momentum
          </div>
        </div>
      </div>
    </div>
  );
}
