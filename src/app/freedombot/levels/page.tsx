"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, ChevronLeft, ChevronRight, Bot } from "lucide-react";
import {
  ZonePriceLadder,
  formatHeroPrice,
  type PublicLevels,
} from "@/components/levels/ZonePriceLadder";
import { freedombotHomePath } from "@/lib/freedombot/dashboard-path";

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
  const pathname = usePathname();
  const deployHref = `${freedombotHomePath(pathname)}?deploy=1`;

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
      className="min-h-[100dvh] flex flex-col"
      style={{
        backgroundColor: "#060912",
        backgroundImage: HEX_BG,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px, 100% 100%",
      }}
    >
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col min-h-0">
        {/* Tab switcher */}
        <div className="flex justify-center mb-4 sm:mb-5 shrink-0">
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
                className="px-3 sm:px-4 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all"
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
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : count === 0 || !item ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <p className="text-sm" style={{ color: "#64748b" }}>
              No levels available yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Compact hero */}
            <div className="text-center mb-3 sm:mb-4 shrink-0">
              <h1
                className="text-lg sm:text-2xl font-black tracking-tight"
                style={{ color: "#f8fafc" }}
              >
                {item.label} Market Levels
              </h1>
              {spot != null && (
                <p
                  className="mt-1 text-2xl sm:text-4xl font-black font-mono tabular-nums tracking-tight"
                  style={{
                    color: "#fcd34d",
                    textShadow: "0 0 24px rgba(251,191,36,0.4), 0 0 48px rgba(251,191,36,0.15)",
                  }}
                >
                  {formatHeroPrice(spot, currency)}
                </p>
              )}
            </div>

            {/* Chart — grows to fill available space */}
            <div className="relative flex-1 flex flex-col justify-center min-h-0 px-6 sm:px-8">
              {hasBands ? (
                <ZonePriceLadder
                  levels={data!}
                  spot={spot}
                  currencySymbol={currency}
                  onRefresh={() => load(true)}
                  refreshing={refreshing}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
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
                    className="absolute top-1/2 -translate-y-1/2 left-0 flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full transition-all hover:scale-105"
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
                    className="absolute top-1/2 -translate-y-1/2 right-0 flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full transition-all hover:scale-105"
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

            {/* Footer + crypto hook */}
            <div className="mt-4 sm:mt-5 shrink-0 text-center space-y-3">
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

              {tab === "crypto" && (
                <div
                  className="mx-auto max-w-md rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4"
                  style={{
                    border: "1px solid rgba(59,130,246,0.25)",
                    backgroundColor: "rgba(37,99,235,0.08)",
                  }}
                >
                  <p className="text-xs sm:text-sm font-medium" style={{ color: "#94a3b8" }}>
                    Automate your trading
                  </p>
                  <Link
                    href={deployHref}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white transition-all hover:brightness-110"
                    style={{
                      background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                      boxShadow: "0 4px 20px rgba(59,130,246,0.3)",
                    }}
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Deploy Bot
                  </Link>
                </div>
              )}

              <p className="text-[11px] sm:text-xs" style={{ color: "#64748b" }}>
                {refreshed ? `Data refreshed ${refreshed}` : "Awaiting refresh"}
                {" | "}
                {scheduleNote}
              </p>

              <p className="text-[10px]" style={{ color: "#334155" }}>
                For informational purposes only; not investment advice.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
