"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Bot, Search, TrendingUp, TrendingDown, Target } from "lucide-react";
import { type PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  LevelsChartPanel,
  LevelsDisclaimer,
  LevelsPageHeader,
  LevelsSplitShell,
  LevelsSymbolList,
  type LevelsListEntry,
} from "@/components/levels/LevelsSplitLayout";
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

const TAB_COPY: Record<TabKey, { title: string; subtitle: string }> = {
  indices: {
    title: "NSE Indices",
    subtitle: "Select an index on the left — chart auto-cycles every 8 seconds.",
  },
  crypto: {
    title: "Crypto",
    subtitle: "Select an asset on the left — chart auto-cycles every 8 seconds.",
  },
  stocks: {
    title: "NSE Stocks",
    subtitle: "Search and pick an F&O symbol on the left to view its levels.",
  },
  inzone: {
    title: "In Zone Now",
    subtitle: "Symbols inside or near a bull/bear zone — chart auto-cycles every 8 seconds.",
  },
};

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
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function formatRefreshed(computedAt: string | null | undefined): string | null {
  if (!computedAt) return null;
  return new Date(computedAt).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const [stockQuery, setStockQuery] = useState("");
  const [stockSlide, setStockSlide] = useState(0);
  const [stockData, setStockData] = useState<{ label: string; data: PublicLevels | null } | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
      setPayload((await res.json()) as LevelsPayload);
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

  const switchTab = (key: TabKey) => {
    setTab(key);
    setSlide(0);
    setInZoneSlide(0);
    setStockSlide(0);
    setStockQuery("");
  };

  const carouselItems = tab === "indices" ? payload?.indices ?? [] : tab === "crypto" ? payload?.crypto ?? [] : [];
  const carouselCount = carouselItems.length;
  const carouselCurrent = carouselCount > 0 ? Math.min(slide, carouselCount - 1) : 0;
  const carouselItem = carouselCount > 0 ? carouselItems[carouselCurrent] : null;
  const carouselCurrency = tab === "crypto" ? "$" : "₹";

  const inZoneList = payload?.inZone ?? [];
  const inZoneCount = inZoneList.length;
  const inZoneCurrent = inZoneCount > 0 ? Math.min(inZoneSlide, inZoneCount - 1) : 0;
  const inZoneActive = inZoneCount > 0 ? inZoneList[inZoneCurrent] : null;

  const filteredStocks = useMemo(() => {
    const q = stockQuery.trim().toUpperCase();
    const universe = FNO_UNIVERSE as readonly string[];
    if (!q) return universe.slice();
    return universe.filter((s) => s.includes(q));
  }, [stockQuery]);

  const stockCount = filteredStocks.length;
  const stockCurrent = stockCount > 0 ? Math.min(stockSlide, stockCount - 1) : 0;
  const activeStockSymbol = stockCount > 0 ? filteredStocks[stockCurrent] : null;

  const statusBySymbol = useMemo(() => {
    const m = new Map<string, ZoneStatus>();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s.status);
    return m;
  }, [payload?.stocks]);

  const scheduleNote = tab === "crypto" ? "Updates 24/7" : "Updates Mon–Fri during market hours";

  const goCarousel = useCallback(
    (dir: number) => setSlide((s) => (carouselCount > 0 ? (s + dir + carouselCount) % carouselCount : 0)),
    [carouselCount],
  );

  const goInZone = useCallback(
    (dir: number) => setInZoneSlide((s) => (inZoneCount > 0 ? (s + dir + inZoneCount) % inZoneCount : 0)),
    [inZoneCount],
  );

  const goStock = useCallback(
    (dir: number) => setStockSlide((s) => (stockCount > 0 ? (s + dir + stockCount) % stockCount : 0)),
    [stockCount],
  );

  // Auto-advance: indices, crypto, in-zone (not the 180-name stock universe).
  useEffect(() => {
    if (tab !== "indices" && tab !== "crypto") return;
    if (carouselCount <= 1) return;
    const id = setTimeout(() => setSlide((s) => (s + 1) % carouselCount), 8000);
    return () => clearTimeout(id);
  }, [carouselCurrent, carouselCount, tab]);

  useEffect(() => {
    if (tab !== "inzone" || inZoneCount <= 1) return;
    const id = setTimeout(() => setInZoneSlide((s) => (s + 1) % inZoneCount), 8000);
    return () => clearTimeout(id);
  }, [inZoneCurrent, inZoneCount, tab]);

  useEffect(() => {
    if (inZoneCount === 0) setInZoneSlide(0);
    else if (inZoneSlide >= inZoneCount) setInZoneSlide(0);
  }, [inZoneCount, inZoneSlide]);

  useEffect(() => {
    if (stockCount === 0) setStockSlide(0);
    else if (stockSlide >= stockCount) setStockSlide(0);
  }, [stockCount, stockSlide]);

  useEffect(() => {
    if (tab !== "stocks" || !activeStockSymbol) return;
    loadStock(activeStockSymbol);
  }, [tab, activeStockSymbol, loadStock]);

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
  }, [inZoneActive?.scope, inZoneActive?.symbol, inZoneActive?.data, inZoneCurrent]);

  const indexEntries: LevelsListEntry[] = useMemo(
    () =>
      (payload?.indices ?? []).map((it) => ({
        id: it.symbol ?? it.label,
        label: it.label,
        spot: it.data?.spot ?? null,
        currency: "₹" as const,
      })),
    [payload?.indices],
  );

  const cryptoEntries: LevelsListEntry[] = useMemo(
    () =>
      (payload?.crypto ?? []).map((it) => ({
        id: it.asset ?? it.label,
        label: it.label,
        spot: it.data?.spot ?? null,
        currency: "$" as const,
      })),
    [payload?.crypto],
  );

  const stockEntries: LevelsListEntry[] = useMemo(
    () =>
      filteredStocks.map((sym) => {
        const st = statusBySymbol.get(sym);
        return {
          id: sym,
          label: sym,
          spot: payload?.stocks.find((s) => s.symbol === sym)?.spot ?? null,
          currency: "₹" as const,
          trailing:
            st && (st === "IN_BULL" || st === "IN_BEAR" || st === "NEAR") ? (
              <span className="h-2 w-2 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: STATUS_META[st].color }} />
            ) : undefined,
        };
      }),
    [filteredStocks, statusBySymbol, payload?.stocks],
  );

  const inZoneEntries: LevelsListEntry[] = useMemo(
    () =>
      inZoneList.map((it) => ({
        id: `${it.scope}-${it.symbol}`,
        label: it.label,
        sublabel: it.scope === "index" ? "Index" : it.scope === "crypto" ? "Crypto" : "Stock",
        spot: it.spot,
        currency: it.currency,
        trailing: <StatusBadge status={it.status} />,
      })),
    [inZoneList],
  );

  const stockSearchHeader = (
    <div className="relative mb-4 shrink-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#475569" }} />
      <input
        value={stockQuery}
        onChange={(e) => {
          setStockQuery(e.target.value);
          setStockSlide(0);
        }}
        placeholder="Search symbol…"
        className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
        style={{
          backgroundColor: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.07)",
          color: "#e2e8f0",
        }}
      />
    </div>
  );

  const cryptoDeployFooter =
    tab === "crypto" ? (
      <div
        className="mx-auto max-w-md rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-3 mb-2"
        style={{ border: "1px solid rgba(59,130,246,0.2)", backgroundColor: "rgba(37,99,235,0.06)" }}
      >
        <p className="text-xs font-medium" style={{ color: "#94a3b8" }}>
          Automate your trading
        </p>
        <Link
          href={deployHref}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white transition-all hover:brightness-110"
          style={{
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            boxShadow: "0 4px 20px rgba(59,130,246,0.25)",
          }}
        >
          <Bot className="h-3.5 w-3.5" />
          Deploy Bot
        </Link>
      </div>
    ) : null;

  const renderCarouselTab = () => {
    if (carouselCount === 0 || !carouselItem) {
      return (
        <div className="flex flex-1 items-center justify-center py-24">
          <p className="text-sm" style={{ color: "#64748b" }}>
            No levels available yet.
          </p>
        </div>
      );
    }
    const data = carouselItem.data;
    const refreshed = formatRefreshed(data?.computedAt);
    const entries = tab === "indices" ? indexEntries : cryptoEntries;

    return (
      <>
        <LevelsSplitShell
          list={
            <LevelsSymbolList
              countLabel={`${carouselCount} ${tab === "indices" ? "indices" : "assets"}`}
              entries={entries}
              activeIndex={carouselCurrent}
              onSelect={setSlide}
            />
          }
          chart={
            <LevelsChartPanel
              title={`${carouselItem.label} Market Levels`}
              spot={data?.spot ?? null}
              currency={carouselCurrency}
              levels={data}
              unavailable={data?.unavailable === true}
              slideCount={carouselCount}
              activeIndex={carouselCurrent}
              onPrev={() => goCarousel(-1)}
              onNext={() => goCarousel(1)}
              onGoTo={setSlide}
              refreshedLabel={refreshed ? `Data refreshed ${refreshed} · ${scheduleNote}` : scheduleNote}
              autoAdvanceNote
              footerExtra={cryptoDeployFooter}
            />
          }
        />
        <LevelsDisclaimer />
      </>
    );
  };

  const renderStocksTab = () => (
    <>
      <LevelsSplitShell
        list={
          <LevelsSymbolList
            countLabel={stockQuery ? `${stockCount} matches` : `${stockCount} symbols`}
            header={stockSearchHeader}
            entries={stockEntries}
            activeIndex={stockCurrent}
            onSelect={setStockSlide}
            emptyMessage="No symbols match your search."
          />
        }
        chart={
          <LevelsChartPanel
            title={`${stockData?.label ?? activeStockSymbol ?? "Stock"} Market Levels`}
            spot={stockData?.data?.spot ?? null}
            currency="₹"
            levels={stockData?.data ?? null}
            loading={stockLoading}
            slideCount={stockCount}
            activeIndex={stockCurrent}
            onPrev={() => goStock(-1)}
            onNext={() => goStock(1)}
            onGoTo={setStockSlide}
            refreshedLabel={
              formatRefreshed(stockData?.data?.computedAt)
                ? `Data refreshed ${formatRefreshed(stockData?.data?.computedAt)} · ${scheduleNote}`
                : scheduleNote
            }
            autoAdvanceNote={false}
          />
        }
      />
      <LevelsDisclaimer scheduleNote={scheduleNote} />
    </>
  );

  const renderInZoneTab = () => {
    if (inZoneCount === 0) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-24 gap-3 flex-1 px-6">
          <p className="text-sm" style={{ color: "#64748b" }}>
            Nothing in a zone right now.
          </p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: "#475569" }}>
            The screener updates as markets move. Check back during the session.
          </p>
          <LevelsDisclaimer />
        </div>
      );
    }

    const chartSpot = inZoneChartData?.spot ?? inZoneActive?.spot ?? null;
    const refreshed = formatRefreshed(inZoneChartData?.computedAt);

    return (
      <>
        <LevelsSplitShell
          list={
            <LevelsSymbolList
              countLabel={`${inZoneCount} in zone`}
              entries={inZoneEntries}
              activeIndex={inZoneCurrent}
              onSelect={setInZoneSlide}
            />
          }
          chart={
            inZoneActive && (
              <LevelsChartPanel
                title={`${inZoneActive.label} Market Levels`}
                spot={chartSpot}
                currency={inZoneActive.currency}
                levels={inZoneChartData}
                loading={inZoneChartLoading}
                slideCount={inZoneCount}
                activeIndex={inZoneCurrent}
                onPrev={() => goInZone(-1)}
                onNext={() => goInZone(1)}
                onGoTo={setInZoneSlide}
                refreshedLabel={refreshed ? `Data refreshed ${refreshed}` : undefined}
                autoAdvanceNote
              />
            )
          }
        />
        <LevelsDisclaimer />
      </>
    );
  };

  const copy = TAB_COPY[tab];

  return (
    <main
      className="min-h-[100dvh] flex flex-col"
      style={{
        backgroundColor: "#060912",
        backgroundImage: HEX_BG,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px, 100% 100%",
      }}
    >
      <div className="flex-1 max-w-6xl mx-auto w-full px-5 sm:px-8 lg:px-10 py-8 sm:py-10 flex flex-col min-h-0">
        <div className="flex justify-center mb-8 sm:mb-10 shrink-0">
          <div
            className="inline-flex items-center gap-1.5 p-1.5 rounded-xl flex-wrap justify-center"
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
                className="relative px-4 py-2 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all"
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
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <LevelsPageHeader title={copy.title} subtitle={copy.subtitle} />
            {tab === "indices" || tab === "crypto"
              ? renderCarouselTab()
              : tab === "stocks"
                ? renderStocksTab()
                : renderInZoneTab()}
          </div>
        )}
      </div>
    </main>
  );
}
