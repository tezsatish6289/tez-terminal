"use client";

import { useEffect, useState } from "react";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import {
  FnoNinjaHeroCard,
  useCyclingHeroFilter,
  useHeroLevels,
} from "@/components/fnoninja/FnoNinjaHeroCard";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";

type TickerItem = { label: string; price: number | null; changePct: number | null };

const fmt = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "—";

function useLiveTicker(): TickerItem[] {
  const [items, setItems] = useState<TickerItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/fnoninja/market-ticker", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: TickerItem[] };
        if (alive) setItems((json.items ?? []).filter((i) => i.price != null));
      } catch {
        /* keep last */
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return items;
}

export function FnoNinjaHero() {
  const payload = useHeroLevels();
  const ticker = useLiveTicker();
  const activeFilter = useCyclingHeroFilter(6500);

  return (
    <section
      className="relative overflow-hidden border-b"
      style={{ borderColor: "rgba(90,140,220,0.08)" }}
    >
      <div className="pointer-events-none absolute inset-0 fno-grid-bg opacity-40" />
      <div
        className={`${FNO_LANDING_SHELL} relative grid grid-cols-1 gap-10 py-16 pb-14 pt-16 lg:grid-cols-2 lg:gap-14 lg:pb-14 lg:pt-24`}
      >
        <div className="relative flex flex-col justify-center">
          <h1 className="text-[42px] font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[58px]">
            Visualize{" "}
            <span className="bg-gradient-to-r from-[#60a5fa] via-[#818cf8] to-[#a78bfa] bg-clip-text text-transparent">
              the price pressure
            </span>
            <br />
            before the move happens.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-slate-400">
            <span className="text-white">Support</span> and{" "}
            <span className="text-white">resistance</span> mapping for Indian F&amp;O stocks based on
            option-chain Open Interest clusters.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <FnoNinjaCtaLink className="w-full sm:w-auto">Explore market map</FnoNinjaCtaLink>
            <span className="text-xs text-slate-500">Informational only · Not investment advice</span>
          </div>
        </div>

        <FnoNinjaHeroCard payload={payload} activeFilter={activeFilter} />
      </div>

      {ticker.length > 0 && (
        <div
          className="relative border-t bg-[#0d1830]/50"
          style={{ borderColor: "rgba(90,140,220,0.08)" }}
        >
          <div className={`${FNO_LANDING_SHELL} overflow-hidden`}>
            <div className="flex w-max animate-marquee gap-6 py-3 text-[12px]">
              {[...ticker, ...ticker].map((t, i) => {
                const up = (t.changePct ?? 0) >= 0;
                return (
                  <span key={i} className="flex items-center gap-2 text-slate-400">
                    <span className="font-semibold text-white">{t.label}</span>
                    <span className="tabular-nums">{fmt(t.price)}</span>
                    {t.changePct != null && (
                      <span className={`tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>
                        {up ? "+" : ""}
                        {t.changePct.toFixed(2)}%
                      </span>
                    )}
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: "rgba(90,140,220,0.18)" }}
                    />
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
