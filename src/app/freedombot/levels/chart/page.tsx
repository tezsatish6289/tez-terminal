"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LevelsChartPageToolbar } from "@/components/levels/LevelsChartPageToolbar";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  formatLevelsChartMeta,
  levelsTradingViewParams,
  type LevelsTvScope,
} from "@/lib/levels/tradingview-symbol";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";

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

  if ((!scope || !symbol) && error) {
    return (
      <main
        className="h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] flex flex-col items-center justify-center gap-4 px-4"
        style={{ backgroundColor: "#060912" }}
      >
        <p className="text-sm text-center" style={{ color: "#94a3b8" }}>
          {error}
        </p>
        <Link
          href="/freedombot/levels"
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: "#60a5fa" }}
        >
          ← Back to bubbles
        </Link>
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
      className="h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)] overflow-hidden flex flex-col"
      style={{ backgroundColor: "#060912" }}
    >
      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5 border-b border-white/5">
        <Link
          href="/freedombot/levels"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider shrink-0"
          style={{ color: "#94a3b8" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Bubbles
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-black tracking-tight truncate" style={{ color: "#f8fafc" }}>
            {symbol}
          </h1>
          {companyName ? (
            <p className="text-[10px] sm:text-[11px] truncate" style={{ color: "#64748b" }}>
              {companyName}
            </p>
          ) : null}
        </div>
        <p
          className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] shrink-0"
          style={{ color: "#64748b" }}
        >
          {formatLevelsChartMeta(config)}
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
        <LevelsChartPageToolbar
          webChartUrl={config.webChartUrl}
          nativeChartRef={nativeChartRef}
          chartFullHistory={chartFullHistory}
        />

        {error ? (
          <p className="text-xs text-center shrink-0" style={{ color: "#f87171" }}>
            {error}
          </p>
        ) : null}

        <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full max-w-6xl mx-auto">
          <div className="w-full h-full min-h-[240px] max-h-[min(58vh,520px)] flex flex-col">
            <LevelsTradingViewChart
              config={config}
              ticker={symbol}
              companyName={companyName ?? undefined}
              levels={levels}
              loading={loading}
              hideChartShortcuts
              showHeader={false}
              nativeChartRef={nativeChartRef}
              onFullHistoryZoomChange={setChartFullHistory}
            />
          </div>
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
