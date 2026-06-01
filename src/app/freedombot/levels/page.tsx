"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZonePriceLadder, type PublicLevels } from "@/components/levels/ZonePriceLadder";

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
  const go = useCallback(
    (dir: number) => setSlide((s) => (count > 0 ? (s + dir + count) % count : 0)),
    [count],
  );

  const switchTab = (key: TabKey) => {
    setTab(key);
    setSlide(0);
  };

  // Auto-advance the slideshow; re-arms on every change (manual or auto).
  useEffect(() => {
    if (count <= 1) return;
    const id = setTimeout(() => setSlide((s) => (s + 1) % count), 8000);
    return () => clearTimeout(id);
  }, [current, count, tab]);

  return (
    <main className="min-h-screen" style={{ backgroundColor: "#080f1e" }}>
      <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="flex flex-col gap-2 mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" style={{ color: "#60a5fa" }} />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: "#f0f4ff" }}>
              Market Levels
            </h1>
          </div>
          <p className="text-sm max-w-2xl leading-relaxed" style={{ color: "#94a3b8" }}>
            Bullish and bearish zones for major indices and crypto, with the session&apos;s
            Point of Control — refreshed every minute. For informational purposes only; not
            investment advice.
          </p>
        </div>

        {/* Tabs + refresh */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl border"
            style={{ borderColor: "rgba(90,140,220,0.15)", backgroundColor: "rgba(15,23,42,0.5)" }}
          >
            {([
              { key: "indices" as TabKey, label: "NSE Indices" },
              { key: "crypto" as TabKey, label: "Crypto Zones" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                style={
                  tab === key
                    ? { backgroundColor: "#2563eb", color: "#f0f4ff" }
                    : { color: "#64748b" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{ borderColor: "rgba(90,140,220,0.15)", color: "#94a3b8", backgroundColor: "rgba(15,23,42,0.5)" }}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Slideshow */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : count === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-xs" style={{ color: "#64748b" }}>No levels available yet.</p>
          </div>
        ) : (
          <div className="relative max-w-2xl mx-auto">
            <div className="relative">
              <LevelCard
                key={items[current].symbol ?? items[current].asset}
                label={items[current].label}
                data={items[current].data}
                currency={currency}
              />

              {count > 1 && (
                <>
                  <button
                    onClick={() => go(-1)}
                    aria-label="Previous"
                    className="absolute top-1/2 -translate-y-1/2 -left-3 sm:-left-5 flex items-center justify-center h-10 w-10 rounded-full border transition-all hover:scale-105"
                    style={{ borderColor: "rgba(90,140,220,0.2)", backgroundColor: "rgba(13,20,38,0.95)", color: "#cbd5e1" }}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => go(1)}
                    aria-label="Next"
                    className="absolute top-1/2 -translate-y-1/2 -right-3 sm:-right-5 flex items-center justify-center h-10 w-10 rounded-full border transition-all hover:scale-105"
                    style={{ borderColor: "rgba(90,140,220,0.2)", backgroundColor: "rgba(13,20,38,0.95)", color: "#cbd5e1" }}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {count > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5">
                {items.map((item, i) => (
                  <button
                    key={item.symbol ?? item.asset}
                    onClick={() => setSlide(i)}
                    aria-label={`Go to ${item.label}`}
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: i === current ? 20 : 8,
                      backgroundColor: i === current ? "#2563eb" : "rgba(90,140,220,0.25)",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] mt-8 text-center" style={{ color: "#475569" }}>
          NSE index levels update Mon–Fri during market hours. Crypto levels update 24/7.
        </p>
      </div>
    </main>
  );
}

function LevelCard({
  label,
  data,
  currency,
}: {
  label: string;
  data: PublicLevels | null;
  currency: string;
}) {
  const spot = data?.spot ?? null;
  const unavailable = data?.unavailable === true;
  const computedAt = data?.computedAt;
  const refreshed = computedAt
    ? new Date(computedAt).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const hasBands =
    data != null && (data.bullLow != null || data.bearLow != null);

  return (
    <div
      className="flex flex-col rounded-2xl border overflow-hidden"
      style={{ borderColor: "rgba(90,140,220,0.12)", backgroundColor: "rgba(13,20,38,0.6)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b"
        style={{ borderColor: "rgba(90,140,220,0.1)" }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-black tracking-tight truncate" style={{ color: "#f0f4ff" }}>
            {label}
          </span>
          {spot != null && (
            <span className="text-xs font-mono font-bold tabular-nums" style={{ color: "#fcd34d" }}>
              {currency}
              {spot >= 1000
                ? Math.round(spot).toLocaleString()
                : spot.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {refreshed && (
            <span className="text-[9px] font-mono whitespace-nowrap" style={{ color: "#64748b" }}>
              Refreshed {refreshed}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {hasBands ? (
        <ZonePriceLadder levels={data!} spot={spot} currencySymbol={currency} />
      ) : (
        <div className="flex flex-col items-center justify-center text-center px-4 py-16 gap-2 min-h-[360px]">
          <p className="text-xs" style={{ color: "#64748b" }}>
            {unavailable ? "Levels temporarily unavailable" : "Awaiting level data"}
          </p>
          <p className="text-[10px]" style={{ color: "#475569" }}>
            {unavailable
              ? "The latest computation could not produce zones. Last-good levels will return on the next refresh."
              : "Levels populate during the next compute cycle."}
          </p>
        </div>
      )}
    </div>
  );
}
