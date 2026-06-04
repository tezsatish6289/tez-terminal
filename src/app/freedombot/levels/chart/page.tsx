"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LevelsChartChrome } from "@/components/levels/LevelsChartChrome";
import { LevelsNewsPanel } from "@/components/levels/LevelsNewsPanel";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { levelsTradingViewParams, type LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import { FB_FULL_HEIGHT_MAIN } from "@/lib/freedombot/responsive";

/** Deep-dive: full viewport width; slideshow keeps max-w-[100rem] + side list. */
const CHART_PAGE_SHELL = "w-full max-w-none flex flex-col flex-1 min-h-0";

function ChartContent() {
  const searchParams = useSearchParams();
  const scopeParam = searchParams.get("scope");
  const scope: LevelsTvScope | null =
    scopeParam === "index" || scopeParam === "stock" ? scopeParam : null;
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [chartFullHistory, setChartFullHistory] = useState(false);
  const nativeChartRef = useRef<NativeCandlesChartHandle>(null);
  const [error, setError] = useState<string | null>(
    !scope || !symbol ? "Invalid chart link — open from the Market Bubbles map." : null,
  );

  const config = useMemo(
    () => (scope && symbol ? levelsTradingViewParams(scope, symbol) : null),
    [scope, symbol],
  );

  const loadLevels = useCallback(async () => {
    if (!scope || !symbol) return;
    setLoading(true);
    setError(null);
    try {
      if (scope === "stock") {
        const res = await fetch(`/api/freedombot/levels?symbol=${encodeURIComponent(symbol)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          label: string;
          data: PublicLevels | null;
          error?: string;
        };
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
      setError("Could not load levels.");
      setLevels(null);
    } finally {
      setLoading(false);
    }
  }, [scope, symbol]);

  useEffect(() => {
    if (!scope || !symbol) {
      setLoading(false);
      return;
    }
    void loadLevels();
  }, [scope, symbol, loadLevels]);

  useEffect(() => {
    setChartFullHistory(false);
  }, [config?.symbol, config?.exchange, config?.candlesScope]);

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
        style={{ backgroundColor: "#060912" }}
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
        style={{ backgroundColor: "#060912" }}
      >
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
      </main>
    );
  }

  return (
    <main
      className={`${FB_FULL_HEIGHT_MAIN} min-w-0`}
      style={{ backgroundColor: "#060912" }}
    >
      <div className={`${CHART_PAGE_SHELL} px-2 sm:px-3 py-2 sm:py-2.5 overflow-hidden min-w-0`}>
        <LevelsChartChrome
          symbol={symbol}
          subtitle={subtitleLine}
          config={config}
          nativeChartRef={nativeChartRef}
          chartFullHistory={chartFullHistory}
        />

        {error ? (
          <p className="text-xs text-center shrink-0 mt-1" style={{ color: "#f87171" }}>
            {error}
          </p>
        ) : null}

        <div className="flex-1 min-h-0 w-full flex flex-col lg:flex-row gap-2 sm:gap-3 mt-1.5 sm:mt-2">
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            <LevelsTradingViewChart
              className="flex-1 min-h-0 h-full"
              config={config}
              ticker={symbol}
              levels={levels}
              loading={loading}
              hideChartShortcuts
              showHeader={false}
              nativeChartRef={nativeChartRef}
              onFullHistoryZoomChange={setChartFullHistory}
            />
          </div>
          <LevelsNewsPanel
            scope={scope ?? "stock"}
            symbol={symbol}
            className="w-full lg:w-[320px] xl:w-[360px] lg:shrink-0 min-h-[16rem] lg:min-h-0"
          />
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
          style={{ backgroundColor: "#060912" }}
        >
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
        </main>
      }
    >
      <ChartContent />
    </Suspense>
  );
}
