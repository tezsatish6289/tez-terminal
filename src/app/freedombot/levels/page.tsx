"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  ZonePriceLadder,
  formatHeroPrice,
  type PublicLevels,
} from "@/components/levels/ZonePriceLadder";

interface RawItem {
  symbol?: string;
  asset?: string;
  label: string;
  data: PublicLevels | null;
}
interface LevelsPayload {
  indices: RawItem[];
  crypto: RawItem[];
  updatedAt: string;
}

type TabKey = "indices" | "crypto";

const HEX_BG = `
  radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.12), transparent),
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
  #060912
`;

export default function LevelsPage() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>("indices");
  const [slide, setSlide] = useState(0);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      const json = (await res.json()) as LevelsPayload;
      setPayload(json);
    } catch {
      /* keep last-good */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const items = tab === "indices" ? payload?.indices ?? [] : payload?.crypto ?? [];
  const currency = tab === "indices" ? "₹" : "$";

  const count = items.length;
  const current = count > 0 ? Math.min(slide, count - 1) : 0;
  const item = count > 0 ? items[current] : null;
  const data = item?.data ?? null;
  const spot = data?.spot ?? null;
  const unavailable = data?.unavailable === true;
  const hasBands = data != null && (data.bullLow != null || data.bearLow != null);

  const refreshed = data?.computedAt
    ? new Date(data.computedAt).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const go = useCallback(
    (dir: number) => setSlide((s) => (count > 0 ? (s + dir + count) % count : 0)),
    [count],
  );

  const switchTab = (key: TabKey) => {
    setTab(key);
    setSlide(0);
  };

  useEffect(() => {
    if (count <= 1) return;
    const id = setTimeout(() => setSlide((s) => (s + 1) % count), 8000);
    return () => clearTimeout(id);
  }, [current, count, tab]);

  const scheduleNote =
    tab === "indices"
      ? "Updates Mon–Fri during market hours"
      : "Updates 24/7";

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "#060912",
        backgroundImage: HEX_BG,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px, 100% 100%",
      }}
    >
      <div className="flex-1 max-w-[1100px] mx-auto w-full px-4 sm:px-8 py-10 sm:py-14 flex flex-col">
        {/* Tab switcher — minimal */}
        <div className="flex justify-center mb-8">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl"
            style={{ backgroundColor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {([
              { key: "indices" as TabKey, label: "NSE Indices" },
              { key: "crypto" as TabKey, label: "Crypto" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                style={
                  tab === key
                    ? { backgroundColor: "rgba(37,99,235,0.35)", color: "#e2e8f0" }
                    : { color: "#64748b" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-32">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : count === 0 || !item ? (
          <div className="flex flex-1 items-center justify-center py-32">
            <p className="text-sm" style={{ color: "#64748b" }}>
              No levels available yet.
            </p>
          </div>
        ) : (
          <div className="relative flex-1 flex flex-col">
            {/* Hero */}
            <div className="text-center mb-8 sm:mb-10">
              <h1
                className="text-2xl sm:text-4xl font-black tracking-tight mb-4"
                style={{ color: "#f8fafc" }}
              >
                {item.label} Market Levels
              </h1>
              {spot != null && (
                <p
                  className="text-4xl sm:text-6xl font-black font-mono tabular-nums tracking-tight"
                  style={{
                    color: "#fcd34d",
                    textShadow: "0 0 40px rgba(251,191,36,0.45), 0 0 80px rgba(251,191,36,0.2)",
                  }}
                >
                  {formatHeroPrice(spot, currency)}
                </p>
              )}
            </div>

            {/* Chart */}
            <div className="relative flex-1">
              {hasBands ? (
                <ZonePriceLadder
                  levels={data!}
                  spot={spot}
                  currencySymbol={currency}
                  onRefresh={() => load(true)}
                  refreshing={refreshing}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-24 gap-2">
                  <p className="text-sm" style={{ color: "#64748b" }}>
                    {unavailable ? "Levels temporarily unavailable" : "Awaiting level data"}
                  </p>
                  <p className="text-xs max-w-sm" style={{ color: "#475569" }}>
                    {unavailable
                      ? "Last-good levels will return on the next refresh."
                      : "Levels populate during the next compute cycle."}
                  </p>
                </div>
              )}

              {count > 1 && (
                <>
                  <button
                    onClick={() => go(-1)}
                    aria-label="Previous"
                    className="absolute top-1/2 -translate-y-1/2 -left-2 sm:-left-6 flex items-center justify-center h-9 w-9 rounded-full transition-all hover:scale-105"
                    style={{
                      border: "1px solid rgba(255,255,255,0.1)",
                      backgroundColor: "rgba(0,0,0,0.6)",
                      color: "#94a3b8",
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => go(1)}
                    aria-label="Next"
                    className="absolute top-1/2 -translate-y-1/2 -right-2 sm:-right-6 flex items-center justify-center h-9 w-9 rounded-full transition-all hover:scale-105"
                    style={{
                      border: "1px solid rgba(255,255,255,0.1)",
                      backgroundColor: "rgba(0,0,0,0.6)",
                      color: "#94a3b8",
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="mt-10 text-center space-y-4">
              {count > 1 && (
                <div className="flex items-center justify-center gap-2">
                  {items.map((it, i) => (
                    <button
                      key={it.symbol ?? it.asset}
                      onClick={() => setSlide(i)}
                      aria-label={`Go to ${it.label}`}
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: i === current ? 24 : 8,
                        backgroundColor:
                          i === current ? "#3b82f6" : "rgba(255,255,255,0.15)",
                      }}
                    />
                  ))}
                </div>
              )}

              <p className="text-xs" style={{ color: "#64748b" }}>
                {refreshed ? `Data refreshed ${refreshed}` : "Awaiting refresh"}
                {" | "}
                {scheduleNote}
              </p>

              <p className="text-[11px]" style={{ color: "#334155" }}>
                For informational purposes only; not investment advice.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
