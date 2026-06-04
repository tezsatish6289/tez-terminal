"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, TrendingUp, TrendingDown, Target } from "lucide-react";
import { type PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  LevelsChartPanel,
  LevelsDisclaimer,
  LevelsTripleColumnShell,
  LevelsChartMetaFooter,
  LevelsSymbolList,
  type LevelsListEntry,
} from "@/components/levels/LevelsSplitLayout";
import { buildLevelsBubbleItems, LevelsBubblesView } from "@/components/levels/LevelsBubblesView";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import { levelsChartPagePath } from "@/lib/levels/levels-chart-url";
import { levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import {
  deriveZoneStatus,
  matchesDirectionalSetup,
  type PocDirectionFilter,
  type ZoneBands,
  type ZoneStatus,
} from "@/lib/zones/zone-status";

interface RawItem {
  symbol?: string;
  label: string;
  data: PublicLevels | null;
}

interface StockListItem {
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  maxPain: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
}

interface InZoneItem {
  scope: "index" | "stock";
  symbol: string;
  label: string;
  status: ZoneStatus;
  spot: number | null;
  currency: "₹";
  data: PublicLevels | null;
}

interface LevelsPayload {
  indices: RawItem[];
  stocks: StockListItem[];
  inZone: InZoneItem[];
  updatedAt: string;
}

type LevelsViewMode = "bubbles" | "slideshow";

const HEX_BG = `
  radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.12), transparent),
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
  #060912
`;

const STATUS_META: Record<ZoneStatus, { label: string; color: string; bg: string }> = {
  IN_BULL: { label: "In Bull Zone", color: "#34d399", bg: "rgba(16,185,129,0.14)" },
  IN_BEAR: { label: "In Bear Zone", color: "#f87171", bg: "rgba(239,68,68,0.14)" },
  NEAR: { label: "Near Zone", color: "#fbbf24", bg: "rgba(251,191,36,0.14)" },
  NEUTRAL: { label: "Neutral", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  ILLIQUID: { label: "No Data", color: "#64748b", bg: "rgba(100,116,139,0.1)" },
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

function levelsHaveBands(data: PublicLevels | null | undefined): boolean {
  return data != null && (data.bullLow != null || data.bearLow != null);
}

function resolveStockCompanyName(symbol: string, fallback?: string | null): string | null {
  const fromMap = fnoCompanyName(symbol);
  if (fromMap) return fromMap;
  const fb = fallback?.trim();
  if (fb && fb.toUpperCase() !== symbol.toUpperCase()) return fb;
  return null;
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

function bandsFromLevels(
  data: PublicLevels | null | undefined,
  spotOverride?: number | null,
): ZoneBands {
  return {
    spot: spotOverride ?? data?.spot ?? null,
    bullLow: data?.bullLow ?? null,
    bullHigh: data?.bullHigh ?? null,
    bearLow: data?.bearLow ?? null,
    bearHigh: data?.bearHigh ?? null,
  };
}

export default function LevelsPage() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<LevelsViewMode>("bubbles");
  const [zoneFilter, setZoneFilter] = useState<PocDirectionFilter>("all");
  const [inZoneSlide, setInZoneSlide] = useState(0);
  const [inZoneChartData, setInZoneChartData] = useState<PublicLevels | null>(null);
  const [inZoneChartLoading, setInZoneChartLoading] = useState(false);
  const [slideshowPaused, setSlideshowPaused] = useState(false);
  const [bubblesHideNeutral, setBubblesHideNeutral] = useState(false);

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

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === "bubbles" ? "slideshow" : "bubbles"));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleViewMode();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleViewMode]);

  const stockBySymbol = useMemo(() => {
    const m = new Map<
      string,
      {
        symbol: string;
        label: string;
        spot: number | null;
        maxPain: number | null;
        bullZoneLow: number | null;
        bullZoneHigh: number | null;
        bearZoneLow: number | null;
        bearZoneHigh: number | null;
      }
    >();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  const bubbleItems = useMemo(
    () => (payload ? buildLevelsBubbleItems(payload.indices, stockBySymbol) : []),
    [payload, stockBySymbol],
  );

  const inZoneListSorted = useMemo(
    () =>
      [...(payload?.inZone ?? [])].sort((a, b) =>
        a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
      ),
    [payload?.inZone],
  );

  const inZoneListFiltered = useMemo(
    () =>
      inZoneListSorted.filter((it) =>
        matchesDirectionalSetup(bandsFromLevels(it.data, it.spot), it.data?.poc ?? null, zoneFilter),
      ),
    [inZoneListSorted, zoneFilter],
  );

  const inZoneCount = inZoneListFiltered.length;
  const inZoneCurrent = inZoneCount > 0 ? Math.min(inZoneSlide, inZoneCount - 1) : 0;
  const inZoneActive = inZoneCount > 0 ? inZoneListFiltered[inZoneCurrent] : null;

  const slideshowEnabled = viewMode === "slideshow" && inZoneCount > 1;

  const toggleSlideshowPause = useCallback(() => {
    setSlideshowPaused((p) => !p);
  }, []);

  const scheduleNote = "Updates Mon–Fri during market hours";

  const activeTv = useMemo(() => {
    if (viewMode !== "slideshow" || !inZoneActive) return null;
    return levelsTradingViewParams(inZoneActive.scope, inZoneActive.symbol);
  }, [viewMode, inZoneActive]);

  const activeChartLevels = useMemo<PublicLevels | null>(() => {
    if (viewMode !== "slideshow" || !inZoneActive) return null;
    return inZoneChartData;
  }, [viewMode, inZoneActive, inZoneChartData]);

  const chartShowsZones = Boolean(activeTv?.nativeCandles && levelsHaveBands(activeChartLevels));

  const activeTicker = inZoneActive?.symbol ?? null;

  const activeCompanyName = useMemo(() => {
    if (!inZoneActive) return null;
    if (inZoneActive.scope === "stock") {
      return resolveStockCompanyName(inZoneActive.symbol, inZoneActive.label);
    }
    return inZoneActive.label;
  }, [inZoneActive]);

  const chartLevelsLoading =
    viewMode === "slideshow" && inZoneChartLoading && inZoneActive?.scope === "stock";

  const goInZone = useCallback(
    (dir: number) => setInZoneSlide((s) => (inZoneCount > 0 ? (s + dir + inZoneCount) % inZoneCount : 0)),
    [inZoneCount],
  );

  useEffect(() => {
    if (slideshowPaused || viewMode !== "slideshow" || inZoneCount <= 1) return;
    const id = setTimeout(() => setInZoneSlide((s) => (s + 1) % inZoneCount), 8000);
    return () => clearTimeout(id);
  }, [inZoneCurrent, inZoneCount, viewMode, slideshowPaused]);

  useEffect(() => {
    if (inZoneCount === 0) setInZoneSlide(0);
    else if (inZoneSlide >= inZoneCount) setInZoneSlide(0);
  }, [inZoneCount, inZoneSlide]);

  useEffect(() => {
    if (!inZoneActive) {
      setInZoneChartData(null);
      return;
    }
    const bundled = inZoneActive.data;
    const hasBands = bundled != null && (bundled.bullLow != null || bundled.bearLow != null);
    const stockNeedsFullFetch =
      inZoneActive.scope === "stock" && hasBands && bundled!.poc == null;

    if (hasBands && !stockNeedsFullFetch) {
      setInZoneChartData(bundled);
      setInZoneChartLoading(false);
      return;
    }
    if (inZoneActive.scope !== "stock") {
      setInZoneChartData(bundled);
      setInZoneChartLoading(false);
      return;
    }
    let cancelled = false;
    setInZoneChartLoading(true);
    fetch(`/api/freedombot/levels?symbol=${encodeURIComponent(inZoneActive.symbol)}`, {
      cache: "no-store",
    })
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

  const openBubbleChart = useCallback((item: { scope: "index" | "stock"; symbol: string }) => {
    window.open(levelsChartPagePath(item.scope, item.symbol), "_blank", "noopener,noreferrer");
  }, []);

  const inZoneEntries: LevelsListEntry[] = useMemo(
    () =>
      inZoneListFiltered.map((it) => {
        const status = deriveZoneStatus(bandsFromLevels(it.data, it.spot));
        return {
          id: `${it.scope}-${it.symbol}`,
          label: it.label,
          sublabel: it.scope === "index" ? "Index" : "Stock",
          spot: it.spot,
          currency: it.currency,
          trailing: <StatusBadge status={status} />,
        };
      }),
    [inZoneListFiltered],
  );

  const zoneFilterChips = (
    <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
      {([
        { key: "all" as PocDirectionFilter, label: "All aligned" },
        { key: "bull" as PocDirectionFilter, label: "In bull · POC above" },
        { key: "bear" as PocDirectionFilter, label: "In bear · POC below" },
      ]).map(({ key, label }) => {
        const active = zoneFilter === key;
        const bull = key === "bull";
        const bear = key === "bear";
        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              setZoneFilter(key);
              setInZoneSlide(0);
            }}
            className="px-2.5 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wide transition-all"
            style={
              active
                ? {
                    backgroundColor: bull
                      ? "rgba(16,185,129,0.22)"
                      : bear
                        ? "rgba(239,68,68,0.22)"
                        : "rgba(37,99,235,0.28)",
                    color: bull ? "#6ee7b7" : bear ? "#fca5a5" : "#e2e8f0",
                    border: `1px solid ${bull ? "rgba(52,211,153,0.45)" : bear ? "rgba(248,113,113,0.45)" : "rgba(96,165,250,0.4)"}`,
                  }
                : {
                    backgroundColor: "rgba(0,0,0,0.25)",
                    color: "#64748b",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const tvChartColumn =
    activeTv != null ? (
      <LevelsTradingViewChart
        config={activeTv}
        ticker={activeTicker ?? activeTv.symbol}
        companyName={activeCompanyName ?? undefined}
        levels={activeChartLevels}
        loading={chartLevelsLoading}
        showSlideshowControl={slideshowEnabled}
        slideshowPaused={slideshowPaused}
        onToggleSlideshowPause={toggleSlideshowPause}
      />
    ) : (
      <div
        className="flex flex-1 items-center justify-center rounded-xl text-center px-4"
        style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
      >
        <p className="text-xs">No aligned setups to chart</p>
      </div>
    );

  const wrapSlideshowBody = (
    list: ReactNode,
    levels: ReactNode,
    opts?: { hideLevelsColumn?: boolean; chartFooter?: ReactNode },
  ) => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <LevelsTripleColumnShell
        list={list}
        levels={levels}
        hideLevelsColumn={opts?.hideLevelsColumn ?? chartShowsZones}
        chart={
          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            {tvChartColumn}
            {opts?.chartFooter}
          </div>
        }
      />
      <LevelsDisclaimer scheduleNote={scheduleNote} />
    </div>
  );

  const renderSlideshow = () => {
    if (inZoneCount === 0) {
      const filteredEmpty = zoneFilter !== "all" && inZoneListSorted.length > 0;
      return wrapSlideshowBody(
        <div className="flex flex-col min-h-0 h-full">
          <div className="shrink-0">{zoneFilterChips}</div>
          <p className="text-sm text-center py-8 px-4" style={{ color: "#64748b" }}>
            {filteredEmpty
              ? "No symbols match this filter right now."
              : "No aligned setups right now."}
          </p>
        </div>,
        <div className="flex flex-1 items-center justify-center text-center px-4">
          <p className="text-xs max-w-xs leading-relaxed" style={{ color: "#475569" }}>
            {filteredEmpty
              ? "Try All aligned, or wait for price to sit in a band with max pain on the pull side."
              : "Needs spot inside bull/bear band and max pain above (bull) or below (bear) spot."}
          </p>
        </div>,
      );
    }

    const chartSpot = inZoneChartData?.spot ?? inZoneActive?.spot ?? null;
    const refreshed = formatRefreshed(inZoneChartData?.computedAt);
    const inZoneNativeChart = chartShowsZones && inZoneActive != null;

    return wrapSlideshowBody(
      <LevelsSymbolList
        countLabel={
          zoneFilter === "all"
            ? `${inZoneCount} aligned`
            : `${inZoneCount} · ${zoneFilter === "bull" ? "bull + POC above" : "bear + POC below"}`
        }
        header={zoneFilterChips}
        entries={inZoneEntries}
        activeIndex={inZoneCurrent}
        onSelect={setInZoneSlide}
      />,
      inZoneActive ? (
        inZoneNativeChart ? (
          <></>
        ) : (
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
            slideshowPaused={slideshowPaused}
            showCarouselArrows={false}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center" style={{ color: "#64748b" }}>
          <p className="text-xs">No selection</p>
        </div>
      ),
      inZoneNativeChart
        ? {
            hideLevelsColumn: true,
            chartFooter: (
              <LevelsChartMetaFooter
                slideCount={inZoneCount}
                activeIndex={inZoneCurrent}
                onGoTo={setInZoneSlide}
                refreshedLabel={refreshed ? `Data refreshed ${refreshed}` : undefined}
                autoAdvanceNote
                slideshowPaused={slideshowPaused}
              />
            ),
          }
        : undefined,
    );
  };

  const viewToggleLabel =
    viewMode === "bubbles"
      ? "Switch to slideshow view"
      : "Switch to bubbles view";
  const viewToggleShortcut = "(Press S for shortcut)";

  const viewToggleButton = (
    <button
      type="button"
      onClick={toggleViewMode}
      title={viewToggleShortcut}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hover:brightness-110 active:scale-[0.98] shrink-0"
      style={{
        background:
          "linear-gradient(135deg, rgba(37,99,235,0.6) 0%, rgba(59,130,246,0.4) 100%)",
        border: "1px solid rgba(96,165,250,0.6)",
        boxShadow: "0 0 16px rgba(37,99,235,0.35)",
      }}
    >
      <span
        className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap"
        style={{ color: "#f8fafc" }}
      >
        {viewToggleLabel}
      </span>
      <span
        className="text-[8px] font-bold uppercase tracking-wider leading-none whitespace-nowrap hidden sm:inline"
        style={{ color: "#93c5fd" }}
      >
        · S
      </span>
    </button>
  );

  return (
    <main
      className="h-[100dvh] overflow-hidden flex flex-col"
      style={{
        backgroundColor: "#060912",
        backgroundImage: HEX_BG,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px, 100% 100%",
      }}
    >
      <div className="flex-1 min-h-0 w-full max-w-[100rem] mx-auto px-3 sm:px-5 py-3 sm:py-4 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {viewMode === "bubbles" ? (
              <LevelsBubblesView
                items={bubbleItems}
                onBubbleOpen={openBubbleChart}
                hideNeutral={bubblesHideNeutral}
                onHideNeutralChange={setBubblesHideNeutral}
                headerActions={viewToggleButton}
              />
            ) : (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 mb-2 px-0.5">
                  {viewToggleButton}
                </div>
                {renderSlideshow()}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
