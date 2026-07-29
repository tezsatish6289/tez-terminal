"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LevelsChartChrome } from "@/components/levels/LevelsChartChrome";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelsChartStatusOverlayProps } from "@/components/levels/LevelsChartCornerStatusBlobs";
import { isSlideshowZoneStale, SLIDESHOW_ZONE_TICK_MS } from "@/lib/levels/slideshow-zones";
import { levelsTradingViewParams, type LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import { LevelsChartDeepDiveLayout } from "@/components/levels/LevelsChartDeepDiveLayout";
import { LevelsChartSideToolbar } from "@/components/levels/LevelsChartSideToolbar";
import { FnoNinjaAccessPaywall } from "@/components/fnoninja/FnoNinjaAccessPaywall";
import { useEntitlements } from "@/hooks/use-entitlements";
import { LevelsChartExpiryPicker } from "@/components/levels/LevelsChartExpiryPicker";
import {
  LevelsOutlookViewToggle,
  type LevelsViewMode,
} from "@/components/levels/LevelsOutlookViewToggle";
import { OiHistoryChart } from "@/components/levels/OiHistoryChart";
import { PvtChart } from "@/components/levels/PvtChart";
import { useChartOutlookKeyboardShortcuts } from "@/lib/levels/use-chart-outlook-keyboard";
import { useTradingViewChartShortcut } from "@/lib/levels/use-tradingview-chart-shortcut";
import { useIndexExpirySelection } from "@/lib/levels/use-index-expiry-selection";
import { FNO_LEVELS_MAIN, FNO_LEVELS_SHELL } from "@/lib/fnoninja/responsive";
import { isHighConfidenceLevels } from "@/lib/levels/levels-source";
import { FNO_APP_SURFACE_STYLE } from "@/lib/fnoninja/theme";
import type { BubbleTone } from "@/lib/zones/bubble-tone";
import { resolveSymbolDisplayTone } from "@/lib/zones/symbol-display-tone";
import { useAtlasSetupScore } from "@/lib/levels/use-atlas-setup-score";

/** Deep-dive: full viewport width; slideshow keeps max-w-[100rem] + side list. */
const CHART_PAGE_SHELL = "w-full max-w-none flex flex-col flex-1 min-h-0";

import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";

function ChartContent() {
  const searchParams = useSearchParams();
  const scopeParam = searchParams.get("scope");
  const scope: LevelsTvScope | null =
    scopeParam === "index" || scopeParam === "stock" ? scopeParam : null;
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();

  // Deep dive is walled for a logged-in member whose access has lapsed. Guests
  // (no auth) still get the public charts — that's the acquisition preview.
  const { subscription, isAuthenticated } = useEntitlements();
  // Phone-blocked trial users get FnoNinjaPhoneGate (not the subscribe paywall).
  const showPaywall =
    isAuthenticated &&
    !subscription.isLoading &&
    !subscription.isActive &&
    !subscription.phoneBlocksAccess;

  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [displayTone, setDisplayTone] = useState<BubbleTone | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [chartFullHistory, setChartFullHistory] = useState(true);
  const [viewMode, setViewMode] = useState<LevelsViewMode>("pvt");
  const nativeChartRef = useRef<NativeCandlesChartHandle>(null);
  const [error, setError] = useState<string | null>(
    !scope || !symbol ? "Invalid chart link — open from the Market Bubbles map." : null,
  );

  const config = useMemo(
    () => (scope && symbol ? levelsTradingViewParams(scope, symbol) : null),
    [scope, symbol],
  );

  const urlExpiryKey = searchParams.get("expiry");
  const urlView = searchParams.get("view");

  const {
    selectedExpiryKey,
    setSelectedExpiryKey,
    displayLevels,
    expiryOptions,
  } = useIndexExpirySelection(levels, scope, urlExpiryKey);

  const chartLevels =
    scope === "index" || scope === "stock" ? displayLevels : levels;

  const levelsForAtlas = chartLevels ?? levels;
  const hasAtlasLevels = Boolean(
    levelsForAtlas &&
      (levelsForAtlas.bullLow != null ||
        levelsForAtlas.bearLow != null ||
        levelsForAtlas.spot != null),
  );
  const atlasSetup = useAtlasSetupScore(scope, symbol, hasAtlasLevels);

  const chartStatusOverlay = useMemo((): LevelsChartStatusOverlayProps => {
    const lv = chartLevels ?? levels;
    return {
      statusTone: displayTone,
      volRegime: lv?.volRegime,
      volRegimeReason: lv?.volRegimeReason,
      atmIV: lv?.atmIV,
      daysToEarnings: lv?.daysToEarnings,
      atlasSetup,
    };
  }, [atlasSetup, chartLevels, displayTone, levels]);

  const loadLevels = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!scope || !symbol) return;
      if (!opts?.quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        if (scope !== "index" && scope !== "stock") return;
        const json = await fetchSymbolLevels(scope, symbol, { slideshow: true });
        if (!json.data && json.error) {
          setLabel(symbol);
          setLevels(null);
          setDisplayTone(null);
          setError(json.error ?? "Could not load levels.");
          return;
        }
        setLabel(json.label ?? symbol);
        setLevels(json.data);
        setDisplayTone(
          json.displayTone ??
            resolveSymbolDisplayTone(json.data, { scanned: Boolean(json.data) }),
        );
        if (json.error && !(json.data?.bullLow != null || json.data?.bearLow != null)) {
          setError(json.error);
        }
      } catch {
        if (!opts?.quiet) {
          setError("Could not load levels.");
          setLevels(null);
          setDisplayTone(null);
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

  /** While this tab is open, refresh zones when older than 5m (indices + stocks). */
  useEffect(() => {
    if ((scope !== "stock" && scope !== "index") || !symbol) return;
    const id = setInterval(() => {
      if (isSlideshowZoneStale(levels?.computedAt)) {
        void loadLevels({ quiet: true });
      }
    }, SLIDESHOW_ZONE_TICK_MS);
    return () => clearInterval(id);
  }, [scope, symbol, levels?.computedAt, loadLevels]);

  useEffect(() => {
    setChartFullHistory(true);
    const canPickView = scope === "index" || scope === "stock";
    if (!canPickView) {
      setViewMode("pvt");
      return;
    }
    if (urlView === "history") setViewMode("history");
    else if (urlView === "chart") setViewMode("chart");
    else if (urlView === "outlook") setViewMode("outlook");
    else setViewMode("pvt");
  }, [config?.symbol, config?.exchange, config?.candlesScope, urlView, scope]);

  const showOutlook = viewMode === "outlook";
  const showHistory = viewMode === "history";
  const showPvt = viewMode === "pvt";
  const expiryPickerEnabled = expiryOptions && expiryOptions.length > 1;
  const showChartExpiryPicker =
    expiryPickerEnabled && (viewMode === "pvt" || viewMode === "chart");

  useChartOutlookKeyboardShortcuts(
    true,
    () => setViewMode("chart"),
    () => setViewMode("outlook"),
    Boolean(scope && symbol),
    { historyAvailable: true, onHistory: () => setViewMode("history"), pvtAvailable: true, onPvt: () => setViewMode("pvt") },
  );

  useTradingViewChartShortcut(
    showPvt ? (config?.dailyWebChartUrl ?? config?.webChartUrl ?? "") : (config?.webChartUrl ?? ""),
    Boolean(config?.webChartUrl),
  );

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
    <main className={`${FNO_LEVELS_MAIN} min-w-0 relative`} style={FNO_APP_SURFACE_STYLE}>
      {showPaywall ? <FnoNinjaAccessPaywall reason="subscription_required" /> : null}
      <div className={`${FNO_LEVELS_SHELL} flex-1 min-h-0 flex flex-col overflow-hidden`}>
        <div className={`${CHART_PAGE_SHELL} py-2 sm:py-2.5 overflow-hidden min-w-0`}>
        {error ? (
          <p className="text-xs text-center shrink-0 mt-1" style={{ color: "#f87171" }}>
            {error}
          </p>
        ) : null}

        <LevelsChartDeepDiveLayout
          chrome={
            <LevelsChartChrome
              symbol={symbol}
              subtitle={subtitleLine}
              config={config}
              nativeChartRef={nativeChartRef}
              chartFullHistory={chartFullHistory}
              hideToolbar
              highConfidence={scope === "index" || isHighConfidenceLevels(levels)}
            />
          }
          viewToggle={
            <LevelsOutlookViewToggle
              value={viewMode}
              onChange={setViewMode}
              trailing={
                showChartExpiryPicker ? (
                  <LevelsChartExpiryPicker
                    options={expiryOptions}
                    value={selectedExpiryKey}
                    onChange={setSelectedExpiryKey}
                  />
                ) : undefined
              }
            />
          }
          toolbar={
            scope ? (
              <LevelsChartSideToolbar
                scope={scope}
                symbol={symbol}
                label={subtitleLine ?? label}
                levels={chartLevels}
                expiryKey={selectedExpiryKey}
                nativeChartRef={nativeChartRef}
              />
            ) : (
              <></>
            )
          }
        >
          {showHistory && scope ? (
            <OiHistoryChart
              className="flex-1 min-h-0 h-full w-full"
              scope={scope}
              symbol={symbol}
              levels={chartLevels}
              webChartUrl={config.webChartUrl}
              showAttribution
              statusOverlay={chartStatusOverlay}
            />
          ) : showPvt && scope ? (
            <PvtChart
              className="flex-1 min-h-0 h-full w-full"
              scope={scope}
              symbol={symbol}
              levels={chartLevels}
              webChartUrl={config.dailyWebChartUrl}
              statusOverlay={chartStatusOverlay}
            />
          ) : showOutlook ? (
            <NiftyOutlookChart
              className="flex-1 min-h-0 h-full w-full"
              levels={levels}
              spot={levels?.spot ?? null}
              webChartUrl={config.webChartUrl}
              showAttribution
              statusOverlay={chartStatusOverlay}
            />
          ) : (
            <LevelsTradingViewChart
              className="flex-1 min-h-0 h-full"
              config={config}
              ticker={symbol}
              levels={chartLevels}
              loading={loading}
              hideChartShortcuts
              hideTvFooterHint
              showHeader={false}
              nativeChartRef={nativeChartRef}
              onFullHistoryZoomChange={setChartFullHistory}
              statusOverlay={chartStatusOverlay}
            />
          )}
        </LevelsChartDeepDiveLayout>
        </div>
      </div>
    </main>
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
      <ChartContent />
    </Suspense>
  );
}
