"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LevelsTradingViewChart } from "@/components/levels/LevelsTradingViewChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { levelsTradingViewParams, type LevelsTvScope } from "@/lib/levels/tradingview-symbol";
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

  const companyName = useMemo(() => {
    if (scope === "stock") return fnoCompanyName(symbol) ?? (label !== symbol ? label : null) : label;
    return label || null;
  }, [scope, symbol, label]);

  if ((!scope || !symbol) && error) {
    return (
      <main className="h-[100dvh] flex flex-col items-center justify-center gap-4 px-4" style={{ backgroundColor: "#060912" }}>
        <p className="text-sm text-center" style={{ color: "#94a3b8" }}>{error}</p>
        <Link href="/freedombot/levels" className="text-xs font-bold uppercase tracking-wider" style={{ color: "#60a5fa" }}>
          ← Back to bubbles
        </Link>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="h-[100dvh] flex items-center justify-center" style={{ backgroundColor: "#060912" }}>
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
      </main>
    );
  }

  return (
    <main
      className="h-[100dvh] overflow-hidden flex flex-col"
      style={{ backgroundColor: "#060912" }}
    >
      <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-white/5">
        <Link
          href="/freedombot/levels"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "#94a3b8" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Bubbles
        </Link>
        <span className="text-[11px] font-mono font-bold" style={{ color: "#e2e8f0" }}>
          {symbol}
        </span>
        {companyName ? (
          <span className="text-[10px] truncate" style={{ color: "#64748b" }}>
            {companyName}
          </span>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 p-2">
        {error ? (
          <p className="text-xs text-center py-4" style={{ color: "#f87171" }}>{error}</p>
        ) : null}
        <LevelsTradingViewChart
          config={config}
          ticker={symbol}
          companyName={companyName ?? undefined}
          levels={levels}
          loading={loading}
        />
      </div>
    </main>
  );
}

export default function LevelsChartPage() {
  return (
    <Suspense
      fallback={
        <main className="h-[100dvh] flex items-center justify-center" style={{ backgroundColor: "#060912" }}>
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#60a5fa" }} />
        </main>
      }
    >
      <ChartContent />
    </Suspense>
  );
}
