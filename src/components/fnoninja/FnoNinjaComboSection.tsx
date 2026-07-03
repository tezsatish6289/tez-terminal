"use client";

import { useEffect, useMemo, useState } from "react";
import { FnoNinjaComboShowcase } from "@/components/fnoninja/FnoNinjaComboShowcase";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

type Status = "IN_BULL" | "IN_BEAR" | "NEAR" | "NEUTRAL";
type IndexEntry = { symbol: string; data?: { spot?: number } };
type LevelsPayload = {
  indices?: IndexEntry[];
  inZone?: Array<{ scope: string; status: Status }>;
};

const fmt = (n: number | undefined | null) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "—";

export function FnoNinjaComboSection() {
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
        /* silent */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const counts = useMemo(() => {
    let atS = 0;
    let atR = 0;
    let near = 0;
    (payload?.inZone ?? [])
      .filter((z) => z.scope === "stock")
      .forEach((z) => {
        if (z.status === "IN_BULL") atS++;
        else if (z.status === "IN_BEAR") atR++;
        else if (z.status === "NEAR") near++;
      });
    return { atS, atR, near };
  }, [payload]);

  const indices = payload?.indices ?? [];

  return (
    <section
      id="platform-combo"
      className="border-b"
      style={{ borderColor: "rgba(90,140,220,0.08)" }}
    >
      <div className={`${FNO_LANDING_SHELL} py-12 sm:py-16 lg:py-20`}>
        <div className="grid items-stretch gap-8 lg:grid-cols-2 lg:gap-12 xl:gap-14">
          <div className="flex min-w-0 flex-col rounded-2xl border border-[rgba(90,140,220,0.18)] bg-[#0d1830]/40 p-4 sm:p-5">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: FNO_ACCENT }}
            >
              Screener + Indicator
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              FNO Ninja —{" "}
              <span className="text-[#60a5fa]">
                Screener + Indicator
              </span>
            </h2>
            <p className="mt-3 max-w-lg text-[14px] leading-relaxed" style={{ color: FNO_MUTED }}>
              We handle the data and do the heavy lifting so you can focus on finding a fitting trade.
            </p>

            <div className="relative mt-4 flex-1 space-y-3 text-[14px] leading-snug" style={{ color: FNO_MUTED }}>
              <p>
                FNO Ninja reads option-chain OI across 200+ NSE F&amp;O symbols and maps likely support
                and resistance zones.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#60a5fa]" />
                  <span>
                  <strong className="font-semibold text-white">Call clusters act as resistance.</strong>{" "}
                  Heavy Call OI at a strike means the market is positioning for a ceiling.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#60a5fa]" />
                  <span>
                  <strong className="font-semibold text-white">Put clusters act as support.</strong> Heavy
                  Put OI means traders are defending a floor.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#60a5fa]" />
                  <span>
                  <strong className="font-semibold text-white">Strike mapping.</strong> Symbols at or near
                  OI clusters show up in the screener so you act on context, not just a chart.
                  </span>
                </li>
              </ul>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] sm:text-[11px]">
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-2">
                  <div className="text-[18px] font-black tabular-nums text-emerald-300">{counts.atS}</div>
                  <div className="uppercase tracking-wider text-emerald-300/80">At Support</div>
                </div>
                <div className="rounded-lg border border-rose-400/30 bg-rose-500/5 p-2">
                  <div className="text-[18px] font-black tabular-nums text-rose-300">{counts.atR}</div>
                  <div className="uppercase tracking-wider text-rose-300/80">At Resistance</div>
                </div>
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-2">
                  <div className="text-[18px] font-black tabular-nums text-amber-200">{counts.near}</div>
                  <div className="uppercase tracking-wider text-amber-200/80">Near Level</div>
                </div>
              </div>
            </div>

            {indices.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-xl border border-[rgba(90,140,220,0.18)] bg-[#0d1830]/60">
                <div className="flex w-max animate-marquee gap-8 px-4 py-3 text-[12px]">
                  {[...indices, ...indices].map((i, idx) => (
                    <span key={idx} className="flex items-center gap-2">
                      <span className="text-slate-400">{i.symbol}</span>
                      <span className="font-semibold tabular-nums">{fmt(i.data?.spot)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <FnoNinjaComboShowcase />
          </div>
        </div>
      </div>
    </section>
  );
}
