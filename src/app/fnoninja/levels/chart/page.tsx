"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LevelsChartChrome } from "@/components/levels/LevelsChartChrome";
import { LevelsChartMetaFooter } from "@/components/levels/LevelsSplitLayout";
import { LevelsNewsPanel } from "@/components/levels/LevelsNewsPanel";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { VolRegimeBadge } from "@/components/levels/VolRegimeBadge";
import {
  isSlideshowZoneStale,
  SLIDESHOW_ZONE_TICK_MS,
  zonesUpdatedFooterLabel,
} from "@/lib/levels/slideshow-zones";
import { levelsTradingViewParams, type LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import { FnoNinjaChartLoginGate } from "@/components/fnoninja/FnoNinjaChartLoginGate";
import { LevelsChartNewsSplit } from "@/components/levels/LevelsChartNewsSplit";
import { LevelsChartExpiryPicker } from "@/components/levels/LevelsChartExpiryPicker";
import { useIndexExpirySelection } from "@/lib/levels/use-index-expiry-selection";
import { FNO_LEVELS_MAIN, FNO_LEVELS_SHELL } from "@/lib/fnoninja/responsive";
import { FnoNinjaFavslideToggle } from "@/components/fnoninja/FnoNinjaFavslideToggle";
import { AskFynn } from "@/components/fnoninja/AskFynn";
import { LevelsSymbolShareButton } from "@/components/levels/LevelsSymbolShareButton";
import { requiresFnoNinjaChartAuth } from "@/lib/fnoninja/auth";
import { isHighConfidenceLevels } from "@/lib/levels/levels-source";
import { FNO_APP_SURFACE_STYLE } from "@/lib/fnoninja/theme";

/** Deep-dive: full viewport width; slideshow keeps max-w-[100rem] + side list. */
const CHART_PAGE_SHELL = "w-full max-w-none flex flex-col flex-1 min-h-0";

function stockLevelsUrl(symbol: string, slideshowPriority: boolean): string {
  const q = slideshowPriority ? "&slideshow=1" : "";
  return `/api/freedombot/levels?symbol=${encodeURIComponent(symbol)}${q}`;
}

function ChartContent() {
  const searchParams = useSearchParams();
  const scopeParam = searchParams.get("scope");
  const scope: LevelsTvScope | null =
    scopeParam === "index" || scopeParam === "stock" ? scopeParam : null;
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [chartFullHistory, setChartFullHistory] = useState(true);
  const [viewMode, setViewMode] = useState<"chart" | "outlook">("chart");
  const nativeChartRef = useRef<NativeCandlesChartHandle>(null);
  const [error, setError] = useState<string | null>(
    !scope || !symbol ? "Invalid chart link — open from the Market Bubbles map." : null,
  );

  const config = useMemo(
    () => (scope && symbol ? levelsTradingViewParams(scope, symbol) : null),
    [scope, symbol],
  );

  const urlExpiryKey = searchParams.get("expiry");

  const {
    selectedExpiryKey,
    setSelectedExpiryKey,
    displayLevels,
    expiryOptions,
  } = useIndexExpirySelection(levels, scope, urlExpiryKey);

  const chartLevels = scope === "index" ? displayLevels : levels;

  const loadLevels = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!scope || !symbol) return;
      if (!opts?.quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        if (scope === "stock") {
          const res = await fetch(stockLevelsUrl(symbol, true), { cache: "no-store" });
          const json = (await res.json()) as {
            label?: string;
            data: PublicLevels | null;
            error?: string;
          };
          if (!res.ok) {
            setLabel(symbol);
            setLevels(null);
            setError(json.error ?? "Could not load levels.");
            return;
          }
          setLabel(json.label ?? symbol);
          setLevels(json.data);
          if (json.error && !(json.data?.bullLow != null || json.data?.bearLow != null)) {
            setError(json.error);
          }
          return;
        }
        const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
        const json = (await res.json()) as {
          indices: { symbol?: string; label: string; data: PublicLevels | null }[];
        };
        const hit = json.indices?.find(
          (it) => (it.symbol ?? it.label).toUpperCase() === symbol,
        );
        if (!hit) {
          setError("Index levels not found.");
          setLevels(null);
          setLabel(symbol);
          return;
        }
        setLabel(hit.label);
        setLevels(hit.data);
      } catch {
        if (!opts?.quiet) {
          setError("Could not load levels.");
          setLevels(null);
        }
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [scope, symbol],
  );

  useEffect(() => {
    if (!scope || !symbol) {
      setLoading(false);
      return;
    }
    void loadLevels();
  }, [scope, symbol, loadLevels]);

  /** While this tab is open, refresh zones when older than 5m (same cadence as slideshow). */
  useEffect(() => {
    if (scope !== "stock" || !symbol) return;
    const id = setInterval(() => {
      if (isSlideshowZoneStale(levels?.computedAt)) {
        void loadLevels({ quiet: true });
      }
    }, SLIDESHOW_ZONE_TICK_MS);
    return () => clearInterval(id);
  }, [scope, symbol, levels?.computedAt, loadLevels]);

  useEffect(() => {
    setChartFullHistory(true);
    setViewMode("chart");
  }, [config?.symbol, config?.exchange, config?.candlesScope]);

  const outlookAvailable =
    scope === "index" && (levels?.zonesByExpiry?.length ?? 0) > 1;
  const showOutlook = outlookAvailable && viewMode === "outlook";

  const companyName = useMemo(() => {
    if (scope === "stock") {
      return fnoCompanyName(symbol) ?? (label !== symbol ? label : null);
    }
    return label || null;
  }, [scope, symbol, label]);

  const subtitleLine = useMemo(() => {
    if (companyName && companyName.toUpperCase() !== symbol) return companyName;
    if (label && label.toUpperCase() !== symbol) return label;
    return null;
  }, [companyName, label, symbol]);

  const zonesUpdatedLabel = zonesUpdatedFooterLabel(chartLevels?.computedAt);
  const pathname = usePathname();

  const showFavslideToggle = Boolean(scope) && Boolean(symbol);

  if ((!scope || !symbol) && error) {
    return (
      <main
        className="h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] flex flex-col items-center justify-center gap-4 px-4"
        style={FNO_APP_SURFACE_STYLE}
      >
        <p className="text-sm text-center" style={{ color: "#94a3b8" }}>
          {error}
        </p>
      </main>
    );
  }

  if (!config) {
    return (
      <main
        className="h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] flex items-center justify-center"
        style={FNO_APP_SURFACE_STYLE}
      >
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
      </main>
    );
  }

  return (
    <main className={`${FNO_LEVELS_MAIN} min-w-0`} style={FNO_APP_SURFACE_STYLE}>
      <div className={`${FNO_LEVELS_SHELL} flex-1 min-h-0 flex flex-col overflow-hidden`}>
        <div className={`${CHART_PAGE_SHELL} py-2 sm:py-2.5 overflow-hidden min-w-0`}>
        <LevelsChartChrome
          symbol={symbol}
          subtitle={subtitleLine}
          config={config}
          nativeChartRef={nativeChartRef}
          chartFullHistory={chartFullHistory}
          hideToolbar
          highConfidence={scope === "index" || isHighConfidenceLevels(levels)}
          badge={
            <VolRegimeBadge
              flag={levels?.volRegime}
              reason={levels?.volRegimeReason}
              atmIV={levels?.atmIV}
              daysToEarnings={levels?.daysToEarnings}
            />
          }
          symbolSearch={
            showFavslideToggle && scope ? (
              <div className="flex items-center gap-2">
                <LevelsSymbolShareButton
                  scope={scope}
                  symbol={symbol}
                  label={subtitleLine ?? label}
                  levels={chartLevels}
                  expiryKey={scope === "index" ? selectedExpiryKey : null}
                  nativeChartRef={nativeChartRef}
                  iconOnly
                />
                <AskFynn scope={scope} symbol={symbol} label={subtitleLine ?? label} />
                <FnoNinjaFavslideToggle scope={scope} symbol={symbol} enabled />
              </div>
            ) : undefined
          }
          expiryPicker={
            scope === "index" && expiryOptions && expiryOptions.length > 1 ? (
              <LevelsChartExpiryPicker
                options={expiryOptions}
                value={selectedExpiryKey}
                onChange={setSelectedExpiryKey}
              />
            ) : undefined
          }
        />

        {error ? (
          <p className="text-xs text-center shrink-0 mt-1" style={{ color: "#f87171" }}>
            {error}
          </p>
        ) : null}

        <LevelsChartNewsSplit
          className="mt-1.5 sm:mt-2"
          chart={
            <>
              {outlookAvailable && (
                <OutlookViewToggle value={viewMode} onChange={setViewMode} />
              )}
              {showOutlook ? (
                <NiftyOutlookChart
                  className="flex-1 min-h-0 h-full w-full"
                  levels={levels}
                  spot={levels?.spot ?? null}
                />
              ) : (
                <LevelsTradingViewChart
                  className="flex-1 min-h-0 h-full"
                  config={config}
                  ticker={symbol}
                  levels={chartLevels}
                  loading={loading}
                  hideChartShortcuts
                  defaultFullHistory
                  showHeader={false}
                  nativeChartRef={nativeChartRef}
                  onFullHistoryZoomChange={setChartFullHistory}
                />
              )}
              <LevelsChartMetaFooter
                slideCount={1}
                activeIndex={0}
                onGoTo={() => {}}
                zonesUpdatedLabel={zonesUpdatedLabel}
              />
            </>
          }
          news={
            <LevelsNewsPanel scope={scope ?? "stock"} symbol={symbol} className="h-full" />
          }
        />
        </div>
      </div>
    </main>
  );
}

function OutlookViewToggle({
  value,
  onChange,
}: {
  value: "chart" | "outlook";
  onChange: (v: "chart" | "outlook") => void;
}) {
  const options: { id: "chart" | "outlook"; label: string }[] = [
    { id: "chart", label: "Chart" },
    { id: "outlook", label: "Outlook" },
  ];
  return (
    <div className="mb-1.5 flex shrink-0 items-center gap-1 self-start rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors"
            style={{
              backgroundColor: active ? "rgba(96,165,250,0.18)" : "transparent",
              color: active ? "#bfdbfe" : "#94a3b8",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ChartPageGate() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const hostname = typeof window !== "undefined" ? window.location.hostname : undefined;
  const gated = requiresFnoNinjaChartAuth(pathname, hostname);

  if (!gated) return <ChartContent />;

  return (
    <FnoNinjaChartLoginGate symbol={symbol || undefined}>
      <ChartContent />
    </FnoNinjaChartLoginGate>
  );
}

export default function LevelsChartPage() {
  return (
    <Suspense
      fallback={
        <main
          className="h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] flex items-center justify-center"
          style={FNO_APP_SURFACE_STYLE}
        >
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
        </main>
      }
    >
      <ChartPageGate />
    </Suspense>
  );
}
