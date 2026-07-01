"use client";

import { useEffect, useState } from "react";
import type { MarketTickerItem } from "@/lib/fnoninja/market-ticker-types";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

const POLL_MS = 60_000;
const POSITIVE_COLOR = FNO_ACCENT;
const NEGATIVE_COLOR = "#f87171";

function formatPrice(label: string, price: number): string {
  if (label === "INDIA VIX") return price.toFixed(2);
  return price.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function TickerStrip({ items }: { items: MarketTickerItem[] }) {
  const visible = items.filter((item) => item.price != null);

  if (visible.length === 0) {
    return (
      <span className="text-[11px] sm:text-xs text-white/40 font-mono tracking-wide">
        Market data loading…
      </span>
    );
  }

  return (
    <>
      {visible.map((item) => {
        const pct = item.changePct;
        const pctColor =
          pct == null ? "#64748b" : pct >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR;

        return (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-mono tracking-wide text-white/90"
          >
            <span className="text-white/70">{item.label}:</span>
            <span>{formatPrice(item.label, item.price!)}</span>
            {pct != null ? (
              <span style={{ color: pctColor }}>{formatPct(pct)}</span>
            ) : null}
          </span>
        );
      })}
    </>
  );
}

type FnoNinjaMarketTickerProps = {
  /** Inside a parent card — softer chrome, no full-bleed bar. */
  embedded?: boolean;
};

export function FnoNinjaMarketTicker({ embedded = false }: FnoNinjaMarketTickerProps) {
  const [items, setItems] = useState<MarketTickerItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/fnoninja/market-ticker", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: MarketTickerItem[] };
        if (!cancelled && Array.isArray(json.items)) {
          setItems(json.items);
        }
      } catch {
        /* keep last good values */
      }
    }

    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const gapClass = "mx-6 sm:mx-10";

  return (
    <div
      className={`w-full overflow-hidden border-b ${embedded ? "shrink-0" : ""}`}
      style={{
        backgroundColor: embedded ? "rgba(255,255,255,0.02)" : "rgba(8,15,30,0.85)",
        borderColor: "rgba(90,140,220,0.08)",
      }}
    >
      <div className="py-2.5 sm:py-3">
        <div className="flex animate-marquee whitespace-nowrap w-max">
          <div className={`inline-flex items-center gap-6 sm:gap-10 ${gapClass}`}>
            <TickerStrip items={items} />
          </div>
          <div className={`inline-flex items-center gap-6 sm:gap-10 ${gapClass}`} aria-hidden="true">
            <TickerStrip items={items} />
          </div>
        </div>
      </div>
    </div>
  );
}
