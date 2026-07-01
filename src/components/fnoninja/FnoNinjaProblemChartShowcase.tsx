"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import { OiHistoryChart } from "@/components/levels/OiHistoryChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelsViewMode } from "@/components/levels/LevelsOutlookViewToggle";
import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import {
  levelsSupportShowcase,
  NIFTY_SHOWCASE_FALLBACK,
  pickWidestSpreadStock,
  type ShowcaseSymbol,
} from "@/lib/levels/pick-widest-cluster-symbol";
import { formatLevelsChartMeta, levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

const ROTATE_MS = 8_000;
const VIEW_ORDER: LevelsViewMode[] = ["chart", "outlook", "history"];

const VIEW_LABELS: Record<LevelsViewMode, string> = {
  chart: "Chart",
  outlook: "Outlook",
  history: "History",
};

interface LevelsPayload {
  stocks: {
    symbol: string;
    label: string;
    spot: number | null;
    bullZoneHigh: number | null;
    bearZoneLow: number | null;
  }[];
}

async function resolveShowcase(): Promise<{ target: ShowcaseSymbol; levels: PublicLevels | null }> {
  const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
  const json = (await res.json()) as LevelsPayload;
  const picked = pickWidestSpreadStock(json.stocks ?? []);

  if (picked) {
    const full = await fetchSymbolLevels("stock", picked.symbol);
    if (levelsSupportShowcase(full.data)) {
      return { target: picked, levels: full.data };
    }
  }

  const nifty = await fetchSymbolLevels("index", NIFTY_SHOWCASE_FALLBACK.symbol);
  return {
    target: NIFTY_SHOWCASE_FALLBACK,
    levels: nifty.data,
  };
}

/** Live rotating chart / outlook / history for the homepage problem section. */
export function FnoNinjaProblemChartShowcase() {
  const [target, setTarget] = useState<ShowcaseSymbol | null>(null);
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<LevelsViewMode>("chart");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await resolveShowcase();
        if (cancelled) return;
        setTarget(result.target);
        setLevels(result.levels);
      } catch {
        if (!cancelled) {
          setTarget(NIFTY_SHOWCASE_FALLBACK);
          setLevels(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || !target) return;
    const id = window.setInterval(() => {
      setViewMode((prev) => {
        const i = VIEW_ORDER.indexOf(prev);
        return VIEW_ORDER[(i + 1) % VIEW_ORDER.length] ?? "chart";
      });
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [loading, target]);

  const tvConfig = useMemo(
    () => (target ? levelsTradingViewParams(target.scope, target.symbol) : null),
    [target],
  );

  const openChart = useCallback(() => {
    if (!target) return;
    const url = levelsChartPagePathForHost(
      window.location.hostname,
      target.scope,
      target.symbol,
      null,
      viewMode,
    );
    window.location.href = url;
  }, [target, viewMode]);

  return (
    <div
      className="rounded-xl sm:rounded-2xl overflow-hidden flex flex-col min-h-[min(52vh,440px)] lg:min-h-[400px] h-full"
      style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
    >
      <div
        className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 border-b flex flex-wrap items-center gap-x-3 gap-y-2"
        style={{ borderColor: "rgba(90,140,220,0.12)" }}
      >
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="h-5 w-28 rounded bg-white/[0.06] animate-pulse" />
          ) : target ? (
            <>
              <p className="font-black text-white text-sm sm:text-base truncate">{target.symbol}</p>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: "#94a3b8" }}>
                {target.label}
                {target.scope === "stock" ? " · widest OI spread" : " · live index"}
              </p>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5 shrink-0">
          {VIEW_ORDER.map((mode) => {
            const active = viewMode === mode;
            return (
              <span
                key={mode}
                className="inline-flex items-center rounded-md px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-semibold transition-colors duration-300"
                style={{
                  backgroundColor: active ? "rgba(96,165,250,0.18)" : "transparent",
                  color: active ? "#bfdbfe" : "#64748b",
                }}
              >
                {VIEW_LABELS[mode]}
              </span>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={openChart}
        className="relative flex-1 min-h-[320px] sm:min-h-[360px] w-full text-left cursor-pointer group"
        aria-label={target ? `Open ${target.symbol} ${VIEW_LABELS[viewMode]} — live demo` : "Loading live chart demo"}
        disabled={loading || !target}
      >
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 flex items-end justify-center pb-3"
          style={{ background: "linear-gradient(to top, rgba(8,15,30,0.85), transparent 40%)" }}
        >
          <span
            className="text-[11px] font-semibold px-3 py-1 rounded-full"
            style={{ color: "#bfdbfe", backgroundColor: "rgba(37,99,235,0.25)" }}
          >
            Open live {VIEW_LABELS[viewMode].toLowerCase()} →
          </span>
        </div>

        {loading || !target || !tvConfig ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
            <span className="text-sm" style={{ color: "#64748b" }}>
              Loading live chart…
            </span>
          </div>
        ) : (
          <div key={`${target.symbol}-${viewMode}`} className="absolute inset-0 p-2 sm:p-3 animate-in fade-in duration-500">
            {viewMode === "history" ? (
              <OiHistoryChart
                className="h-full w-full"
                scope={target.scope}
                symbol={target.symbol}
              />
            ) : viewMode === "outlook" ? (
              <NiftyOutlookChart
                className="h-full w-full"
                levels={levels}
                spot={levels?.spot ?? null}
                compact
              />
            ) : (
              <LevelsTradingViewChart
                className="h-full w-full"
                config={tvConfig}
                ticker={target.symbol}
                companyName={target.label}
                levels={levels}
                loading={false}
                hideChartShortcuts
                showHeader={false}
              />
            )}
          </div>
        )}
      </button>

      {tvConfig && !loading ? (
        <p
          className="shrink-0 px-3 sm:px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] border-t"
          style={{ borderColor: "rgba(90,140,220,0.08)", color: "#475569" }}
        >
          {formatLevelsChartMeta(tvConfig)}
        </p>
      ) : null}
    </div>
  );
}
