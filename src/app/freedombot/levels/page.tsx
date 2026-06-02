"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, ChevronLeft, ChevronRight, Bot, Search, TrendingUp, TrendingDown, Target } from "lucide-react";
import {
  ZonePriceLadder,
  formatHeroPrice,
  type PublicLevels,
} from "@/components/levels/ZonePriceLadder";
import { freedombotHomePath } from "@/lib/freedombot/dashboard-path";
import { FNO_UNIVERSE } from "@/lib/nse/fno-universe";
import type { ZoneStatus } from "@/lib/zones/zone-status";

interface RawItem {
  symbol?: string;
  asset?: string;
  label: string;
  data: PublicLevels | null;
}

interface StockListItem {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
}

interface InZoneItem {
  scope: "index" | "crypto" | "stock";
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  currency: "₹" | "$";
  data: PublicLevels | null;
}

interface LevelsPayload {
  indices: RawItem[];
  crypto: RawItem[];
  stocks: StockListItem[];
  inZone: InZoneItem[];
  updatedAt: string;
}

type TabKey = "indices" | "crypto" | "stocks" | "inzone";

const HEX_BG = `
  radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.12), transparent),
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
  #060912
`;

const STATUS_META: Record<ZoneStatus, { label: string; color: string; bg: string }> = {
  IN_BULL:  { label: "In Bull Zone",  color: "#34d399", bg: "rgba(16,185,129,0.14)" },
  IN_BEAR:  { label: "In Bear Zone",  color: "#f87171", bg: "rgba(239,68,68,0.14)" },
  NEAR:     { label: "Near Zone",     color: "#fbbf24", bg: "rgba(251,191,36,0.14)" },
  NEUTRAL:  { label: "Neutral",       color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  ILLIQUID: { label: "No Data",       color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

function StatusBadge({ status }: { status: ZoneStatus }) {
  const m = STATUS_META[status];
  const Icon = status === "IN_BULL" ? TrendingUp : status === "IN_BEAR" ? TrendingDown : Target;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

export default function LevelsPage() {
  const pathname = usePathname();
  const deployHref = `${freedombotHomePath(pathname)}?deploy=1`;

  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("indices");
  const [slide, setSlide] = useState(0);
  const [inZoneSlide, setInZoneSlide] = useState(0);
  const [inZoneChartData, setInZoneChartData] = useState<PublicLevels | null>(null);
  const [inZoneChartLoading, setInZoneChartLoading] = useState(false);

  // Stocks tab state
  const [stockQuery, setStockQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [stockData, setStockData] = useState<{ label: string; data: PublicLevels | null } | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      const json = (await res.json()) as LevelsPayload;
      setPayload(json);
    } catch {
      /* keep last-good */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const loadStock = useCallback(async (symbol: string) => {
    setSelectedStock(symbol);
    setStockLoading(true);
    try {
      const res = await fetch(`/api/freedombot/levels?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const json = (await res.json()) as { label: string; data: PublicLevels | null };
      setStockData({ label: json.label, data: json.data });
    } catch {
      setStockData(null);
    } finally {
      setStockLoading(false);
    }
  }, []);

  const carouselItems = tab === "indices" ? payload?.indices ?? [] : tab === "crypto" ? payload?.crypto ?? [] : [];
  const currency = tab === "crypto" ? "$" : "₹";

  const count = carouselItems.length;
  const current = count > 0 ? Math.min(slide, count - 1) : 0;
  const item = count > 0 ? carouselItems[current] : null;
  const data = item?.data ?? null;
  const spot = data?.spot ?? null;
  const unavailable = data?.unavailable === true;
  const hasBands = data != null && (data.bullLow != null || data.bearLow != null);

  const refreshed = data?.computedAt
    ? new Date(data.computedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  const go = useCallback(
    (dir: number) => setSlide((s) => (count > 0 ? (s + dir + count) % count : 0)),
    [count],
  );

  const switchTab = (key: TabKey) => {
    setTab(key);
    setSlide(0);
    setInZoneSlide(0);
  };

  const inZoneList = payload?.inZone ?? [];
  const inZoneCount = inZoneList.length;
  const inZoneCurrent = inZoneCount > 0 ? Math.min(inZoneSlide, inZoneCount - 1) : 0;
  const inZoneActive = inZoneCount > 0 ? inZoneList[inZoneCurrent] : null;

  useEffect(() => {
    if (tab !== "indices" && tab !== "crypto") return;
    if (count <= 1) return;
    const id = setTimeout(() => setSlide((s) => (s + 1) % count), 8000);
    return () => clearTimeout(id);
  }, [current, count, tab]);

  useEffect(() => {
    if (tab !== "inzone") return;
    if (inZoneCount <= 1) return;
    const id = setTimeout(() => setInZoneSlide((s) => (s + 1) % inZoneCount), 8000);
    return () => clearTimeout(id);
  }, [inZoneCurrent, inZoneCount, tab]);

  useEffect(() => {
    if (inZoneCount === 0) {
      setInZoneSlide(0);
      return;
    }
    if (inZoneSlide >= inZoneCount) setInZoneSlide(0);
  }, [inZoneCount, inZoneSlide]);

  // Resolve chart data for the active In-Zone slide (fetch stocks if aggregate lacked bands).
  useEffect(() => {
    if (!inZoneActive) {
      setInZoneChartData(null);
      return;
    }
    if (inZoneActive.data && (inZoneActive.data.bullLow != null || inZoneActive.data.bearLow != null)) {
      setInZoneChartData(inZoneActive.data);
      setInZoneChartLoading(false);
      return;
    }
    if (inZoneActive.scope !== "stock") {
      setInZoneChartData(inZoneActive.data);
      setInZoneChartLoading(false);
      return;
    }
    let cancelled = false;
    setInZoneChartLoading(true);
    fetch(`/api/freedombot/levels?symbol=${encodeURIComponent(inZoneActive.symbol)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data: PublicLevels | null }) => {
        if (!cancelled) setInZoneChartData(json.data);
      })
      .catch(() => {
        if (!cancelled) setInZoneChartData(null);
      })
      .finally(() => {
        if (!cancelled) setInZoneChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inZoneActive]);

  const goInZone = useCallback(
    (dir: number) => setInZoneSlide((s) => (inZoneCount > 0 ? (s + dir + inZoneCount) % inZoneCount : 0)),
    [inZoneCount],
  );

  const filteredStocks = useMemo(() => {
    const q = stockQuery.trim().toUpperCase();
    const universe = FNO_UNIVERSE as readonly string[];
    if (!q) return universe.slice();
    return universe.filter((s) => s.includes(q));
  }, [stockQuery]);

  const statusBySymbol = useMemo(() => {
    const m = new Map<string, ZoneStatus>();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s.status);
    return m;
  }, [payload?.stocks]);

  const scheduleNote = tab === "crypto" ? "Updates 24/7" : "Updates Mon–Fri during market hours";

  const stockHasBands = stockData?.data != null && (stockData.data.bullLow != null || stockData.data.bearLow != null);

  const inZoneChartSpot = inZoneChartData?.spot ?? inZoneActive?.spot ?? null;
  const inZoneHasBands =
    inZoneChartData != null && (inZoneChartData.bullLow != null || inZoneChartData.bearLow != null);
  const inZoneRefreshed = inZoneChartData?.computedAt
    ? new Date(inZoneChartData.computedAt).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const containerMaxW = tab === "inzone" ? "max-w-6xl" : "max-w-2xl";

  return (
    <main
      className="min-h-[100dvh] flex flex-col"
      style={{
        backgroundColor: "#060912",
        backgroundImage: HEX_BG,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px, 100% 100%",
      }}
    >
      <div className={`flex-1 ${containerMaxW} mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col min-h-0`}>
        {/* Tab switcher */}
        <div className="flex justify-center mb-4 sm:mb-5 shrink-0">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl flex-wrap justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {([
              { key: "indices" as TabKey, label: "NSE Indices", pro: false },
              { key: "crypto" as TabKey, label: "Crypto", pro: false },
              { key: "stocks" as TabKey, label: "NSE Stocks", pro: true },
              { key: "inzone" as TabKey, label: "In Zone", pro: true },
            ]).map(({ key, label, pro }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className="relative px-3 sm:px-4 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all"
                style={tab === key ? { backgroundColor: "rgba(37,99,235,0.35)", color: "#e2e8f0" } : { color: "#64748b" }}
              >
                {label}
                {pro && (
                  <span
                    className="ml-1 align-top text-[7px] font-black px-1 py-px rounded"
                    style={{ color: "#fcd34d", backgroundColor: "rgba(251,191,36,0.15)" }}
                  >
                    PRO
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : tab === "inzone" ? (
          /* ───────────────── In Zone: list (left) + chart slideshow (right) ───────────────── */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="text-center mb-3 sm:mb-4 shrink-0">
              <h1 className="text-lg sm:text-2xl font-black tracking-tight" style={{ color: "#f8fafc" }}>
                In Zone Now
              </h1>
              <p className="mt-1 text-xs" style={{ color: "#64748b" }}>
                Symbols inside or near a bull/bear zone — auto-cycling chart on the right
              </p>
            </div>

            {inZoneCount === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16 gap-2 flex-1">
                <p className="text-sm" style={{ color: "#64748b" }}>Nothing in a zone right now.</p>
                <p className="text-xs max-w-sm" style={{ color: "#475569" }}>
                  The screener updates as markets move. Check back during the session.
                </p>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4 lg:gap-5">
                {/* Left — list */}
                <aside
                  className="w-full lg:w-[min(100%,300px)] lg:shrink-0 flex flex-col min-h-0 lg:max-h-[min(72vh,640px)]"
                  style={{ borderRight: "none" }}
                >
                  <p
                    className="text-[9px] font-black uppercase tracking-[0.14em] mb-2 shrink-0"
                    style={{ color: "#64748b" }}
                  >
                    {inZoneCount} in zone
                  </p>
                  <div className="flex-1 overflow-y-auto -mx-0.5 px-0.5 flex flex-col gap-1.5 min-h-[120px] lg:min-h-0">
                    {inZoneList.map((it, i) => {
                      const active = i === inZoneCurrent;
                      return (
                        <button
                          key={`${it.scope}-${it.symbol}`}
                          onClick={() => setInZoneSlide(i)}
                          className="flex flex-col gap-1 px-3 py-2.5 rounded-xl text-left transition-all"
                          style={{
                            backgroundColor: active ? "rgba(37,99,235,0.22)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${active ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.06)"}`,
                            boxShadow: active ? "0 0 20px rgba(59,130,246,0.12)" : "none",
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0"
                              style={{ color: "#93c5fd", backgroundColor: "rgba(59,130,246,0.12)" }}
                            >
                              {it.scope === "index" ? "Index" : it.scope === "crypto" ? "Crypto" : "Stock"}
                            </span>
                            <StatusBadge status={it.status} />
                          </div>
                          <span className="text-sm font-bold truncate w-full" style={{ color: "#e2e8f0" }}>
                            {it.label}
                          </span>
                          {it.spot != null && (
                            <span className="text-xs font-mono tabular-nums" style={{ color: "#94a3b8" }}>
                              {formatHeroPrice(it.spot, it.currency)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </aside>

                {/* Right — slideshow chart */}
                <section className="flex flex-col flex-1 min-w-0 min-h-[320px] lg:min-h-0">
                  {inZoneActive && (
                    <>
                      <div className="text-center mb-2 sm:mb-3 shrink-0">
                        <h2 className="text-base sm:text-xl font-black tracking-tight" style={{ color: "#f8fafc" }}>
                          {inZoneActive.label} Market Levels
                        </h2>
                        {inZoneChartSpot != null && (
                          <p
                            className="mt-1 text-xl sm:text-3xl font-black font-mono tabular-nums tracking-tight"
                            style={{
                              color: "#fcd34d",
                              textShadow: "0 0 20px rgba(251,191,36,0.35)",
                            }}
                          >
                            {formatHeroPrice(inZoneChartSpot, inZoneActive.currency)}
                          </p>
                        )}
                      </div>

                      <div className="relative flex-1 flex flex-col justify-center min-h-0 pl-1 pr-5 sm:px-6">
                        {inZoneChartLoading ? (
                          <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
                          </div>
                        ) : inZoneHasBands && inZoneChartData ? (
                          <ZonePriceLadder
                            levels={inZoneChartData}
                            spot={inZoneChartSpot}
                            currencySymbol={inZoneActive.currency}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                            <p className="text-sm" style={{ color: "#64748b" }}>Awaiting level data</p>
                            <p className="text-xs max-w-sm" style={{ color: "#475569" }}>
                              Bands will appear on the next refresh cycle.
                            </p>
                          </div>
                        )}

                        {inZoneCount > 1 && (
                          <>
                            <button
                              onClick={() => goInZone(-1)}
                              aria-label="Previous in zone symbol"
                              className="absolute top-1/2 -translate-y-1/2 -left-1 sm:left-0 flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full transition-all hover:scale-105"
                              style={{
                                border: "1px solid rgba(255,255,255,0.1)",
                                backgroundColor: "rgba(0,0,0,0.6)",
                                color: "#94a3b8",
                              }}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => goInZone(1)}
                              aria-label="Next in zone symbol"
                              className="absolute top-1/2 -translate-y-1/2 -right-1 sm:right-0 flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full transition-all hover:scale-105"
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

                      <div className="mt-3 shrink-0 text-center space-y-2">
                        {inZoneCount > 1 && (
                          <div className="flex items-center justify-center gap-2">
                            {inZoneList.map((it, i) => (
                              <button
                                key={`dot-${it.scope}-${it.symbol}`}
                                onClick={() => setInZoneSlide(i)}
                                aria-label={`Go to ${it.label}`}
                                className="h-1.5 rounded-full transition-all"
                                style={{
                                  width: i === inZoneCurrent ? 24 : 8,
                                  backgroundColor: i === inZoneCurrent ? "#3b82f6" : "rgba(255,255,255,0.15)",
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <p className="text-[11px]" style={{ color: "#64748b" }}>
                          {inZoneRefreshed ? `Data refreshed ${inZoneRefreshed}` : "Awaiting refresh"}
                          {inZoneCount > 1 && " · Auto-advances every 8s"}
                        </p>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            <p className="text-[10px] text-center mt-4 shrink-0" style={{ color: "#334155" }}>
              For informational purposes only; not investment advice.
            </p>
          </div>
        ) : tab === "stocks" ? (
          /* ───────────────── NSE Stocks picker + ladder ───────────────── */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="relative mb-3 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#475569" }} />
              <input
                value={stockQuery}
                onChange={(e) => setStockQuery(e.target.value)}
                placeholder="Search F&O stocks (e.g. RELIANCE)"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
              />
            </div>

            {selectedStock && (
              <div className="mb-3 shrink-0">
                <div className="text-center">
                  <h1 className="text-lg sm:text-2xl font-black tracking-tight" style={{ color: "#f8fafc" }}>
                    {stockData?.label ?? selectedStock} Market Levels
                  </h1>
                  {stockData?.data?.spot != null && (
                    <p
                      className="mt-1 text-2xl sm:text-4xl font-black font-mono tabular-nums tracking-tight"
                      style={{ color: "#fcd34d", textShadow: "0 0 24px rgba(251,191,36,0.4)" }}
                    >
                      {formatHeroPrice(stockData.data.spot, "₹")}
                    </p>
                  )}
                </div>
                <div className="relative mt-2" style={{ minHeight: 260 }}>
                  {stockLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
                    </div>
                  ) : stockHasBands ? (
                    <ZonePriceLadder levels={stockData!.data!} spot={stockData!.data!.spot} currencySymbol="₹" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                      <p className="text-sm" style={{ color: "#64748b" }}>Levels unavailable for {selectedStock}</p>
                      <p className="text-xs max-w-sm" style={{ color: "#475569" }}>
                        This name may be illiquid or not yet refreshed. It will populate on the next compute cycle.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredStocks.map((sym) => {
                  const st = statusBySymbol.get(sym);
                  const active = sym === selectedStock;
                  return (
                    <button
                      key={sym}
                      onClick={() => loadStock(sym)}
                      className="flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg text-left transition-all hover:brightness-125"
                      style={{
                        backgroundColor: active ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <span className="text-[11px] font-bold truncate" style={{ color: "#e2e8f0" }}>{sym}</span>
                      {st && (st === "IN_BULL" || st === "IN_BEAR" || st === "NEAR") && (
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: STATUS_META[st].color }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] text-center mt-3 shrink-0" style={{ color: "#334155" }}>
              {scheduleNote} · For informational purposes only; not investment advice.
            </p>
          </div>
        ) : count === 0 || !item ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <p className="text-sm" style={{ color: "#64748b" }}>No levels available yet.</p>
          </div>
        ) : (
          /* ───────────────── Indices / Crypto carousel (unchanged) ───────────────── */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="text-center mb-3 sm:mb-4 shrink-0">
              <h1 className="text-lg sm:text-2xl font-black tracking-tight" style={{ color: "#f8fafc" }}>
                {item.label} Market Levels
              </h1>
              {spot != null && (
                <p
                  className="mt-1 text-2xl sm:text-4xl font-black font-mono tabular-nums tracking-tight"
                  style={{ color: "#fcd34d", textShadow: "0 0 24px rgba(251,191,36,0.4), 0 0 48px rgba(251,191,36,0.15)" }}
                >
                  {formatHeroPrice(spot, currency)}
                </p>
              )}
            </div>

            <div className="relative flex-1 flex flex-col justify-center min-h-0 pl-1 pr-5 sm:px-8">
              {hasBands ? (
                <ZonePriceLadder levels={data!} spot={spot} currencySymbol={currency} />
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
                    className="absolute top-1/2 -translate-y-1/2 -left-1 sm:left-0 flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full transition-all hover:scale-105"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.6)", color: "#94a3b8" }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => go(1)}
                    aria-label="Next"
                    className="absolute top-1/2 -translate-y-1/2 -right-1 sm:right-0 flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full transition-all hover:scale-105"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.6)", color: "#94a3b8" }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>

            <div className="mt-4 sm:mt-5 shrink-0 text-center space-y-3">
              {count > 1 && (
                <div className="flex items-center justify-center gap-2">
                  {carouselItems.map((it, i) => (
                    <button
                      key={it.symbol ?? it.asset}
                      onClick={() => setSlide(i)}
                      aria-label={`Go to ${it.label}`}
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: i === current ? 24 : 8, backgroundColor: i === current ? "#3b82f6" : "rgba(255,255,255,0.15)" }}
                    />
                  ))}
                </div>
              )}

              {tab === "crypto" && (
                <div
                  className="mx-auto max-w-md rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4"
                  style={{ border: "1px solid rgba(59,130,246,0.25)", backgroundColor: "rgba(37,99,235,0.08)" }}
                >
                  <p className="text-xs sm:text-sm font-medium" style={{ color: "#94a3b8" }}>Automate your trading</p>
                  <Link
                    href={deployHref}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white transition-all hover:brightness-110"
                    style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
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
