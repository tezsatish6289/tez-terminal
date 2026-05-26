"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, TrendingUp } from "lucide-react";
import { BRAND_CURVE_STROKE } from "@/lib/chart-brand-colors";
import {
  buildCapitalCurveChartRows,
  computeCapitalCurveYDomain,
  type CapitalCurveChartRow,
  type CapitalCurvePayload,
} from "@/lib/freedombot/capital-curve-types";
import { exchangeLabel } from "@/components/freedombot/dashboard/exchange-labels";
import { ExchangeIcon } from "@/components/freedombot/dashboard/ExchangeIcon";
import { CRYPTO_PERP_EXCHANGES } from "@/lib/crypto-bots";
import { useChartMotion } from "@/hooks/use-chart-motion";

const BOT_COLORS = [
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
];

function money(v: number, currency: string): string {
  const sym = currency === "INR" ? "₹" : "$";
  return `${sym}${Math.abs(v).toFixed(2)}`;
}

function runningDaysLabel(deployedAt: string): string {
  try {
    const deploy = parseISO(deployedAt);
    const days = differenceInCalendarDays(new Date(), deploy);
    const running = days <= 0 ? 1 : days;
    return `${running} day${running === 1 ? "" : "s"}`;
  } catch {
    return "—";
  }
}

function CapitalCurveTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { payload: CapitalCurveChartRow; value: number }[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const wallet = row.wallet;

  return (
    <div
      className="px-3 py-2 text-xs"
      style={{
        backgroundColor: "#0a1628",
        border: "1px solid rgba(90,140,220,0.2)",
        borderRadius: 8,
      }}
    >
      <p className="font-bold text-white mb-1.5">
        {(() => {
          try {
            return format(parseISO(String(label)), "MMM d, yyyy");
          } catch {
            return String(label);
          }
        })()}
      </p>
      {wallet != null && (
        <p style={{ color: "#93c5fd" }}>
          Wallet: <span className="font-mono font-bold">{money(wallet, currency)}</span>
        </p>
      )}
    </div>
  );
}

interface ExchangeCapitalCurveProps {
  exchanges: string[];
  fetchToken: () => Promise<string>;
}

export function ExchangeCapitalCurve({ exchanges, fetchToken }: ExchangeCapitalCurveProps) {
  const cryptoExchanges = useMemo(
    () =>
      [...new Set(exchanges.map((e) => e.toUpperCase()))].filter((e) =>
        (CRYPTO_PERP_EXCHANGES as readonly string[]).includes(e),
      ),
    [exchanges],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [payload, setPayload] = useState<CapitalCurvePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const motion = useChartMotion();

  useEffect(() => {
    if (cryptoExchanges.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) =>
      prev && cryptoExchanges.includes(prev) ? prev : cryptoExchanges[0],
    );
  }, [cryptoExchanges]);

  const loadCurve = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const token = await fetchToken();
      const res = await fetch(
        `/api/freedombot/capital-curve?exchange=${encodeURIComponent(selected)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load chart");
        setPayload(null);
        return;
      }
      setPayload(data as CapitalCurvePayload);
    } catch {
      setError("Failed to load chart");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [selected, fetchToken]);

  useEffect(() => {
    void loadCurve();
  }, [loadCurve]);

  const chartRows = useMemo(
    () => (payload ? buildCapitalCurveChartRows(payload) : []),
    [payload],
  );

  const yDomain = useMemo(
    () => (payload ? computeCapitalCurveYDomain(chartRows) : ([0, 100] as [number, number])),
    [chartRows, payload],
  );

  const yTickDecimals = yDomain[1] - yDomain[0] < 20 ? 1 : 0;

  const hasChartData = chartRows.some((r) => r.wallet != null);

  if (cryptoExchanges.length === 0) return null;

  const anim = motion.enabled
    ? { isAnimationActive: true as const, animationDuration: motion.duration }
    : { isAnimationActive: false as const };

  const cs = payload?.currency === "INR" ? "₹" : "$";

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "#0a1628",
        border: "1px solid rgba(90,140,220,0.15)",
      }}
    >
      <div
        className="px-5 py-4 sm:px-6 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        style={{ borderColor: "rgba(90,140,220,0.12)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(37,99,235,0.15)" }}
          >
            <TrendingUp className="h-4 w-4" style={{ color: "#60a5fa" }} />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight">
              Capital on exchange
            </h2>
            <p className="text-xs mt-0.5 leading-relaxed max-w-xl" style={{ color: "#475569" }}>
              Shared futures wallet on this exchange — updated from balance snapshots.
            </p>
          </div>
        </div>

        {cryptoExchanges.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {cryptoExchanges.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setSelected(ex)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                style={{
                  backgroundColor:
                    selected === ex ? "rgba(59,130,246,0.2)" : "rgba(15,30,55,0.6)",
                  color: selected === ex ? "#93c5fd" : "#64748b",
                  border:
                    selected === ex
                      ? "1px solid rgba(59,130,246,0.45)"
                      : "1px solid rgba(90,140,220,0.1)",
                }}
              >
                <ExchangeIcon exchange={ex} size={18} />
                {exchangeLabel(ex)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <div className="w-full min-w-0 px-2 py-4 sm:px-4 sm:py-5" style={{ minHeight: 280 }}>
          {loading && (
            <div className="h-[260px] flex items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin" style={{ color: "#3b82f6" }} />
            </div>
          )}
          {!loading && error && (
            <p className="text-sm text-center py-16" style={{ color: "#f87171" }}>
              {error}
            </p>
          )}
          {!loading && !error && !hasChartData && (
            <p className="text-sm text-center py-16" style={{ color: "#475569" }}>
              Chart will populate as wallet balance snapshots accumulate.
            </p>
          )}
          {!loading && !error && hasChartData && payload && (
            <>
              <div className="flex flex-wrap gap-3 px-3 mb-3 text-[10px] font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5" style={{ color: "#93c5fd" }}>
                  <span
                    className="inline-block w-3 h-0.5 rounded"
                    style={{ backgroundColor: BRAND_CURVE_STROKE }}
                  />
                  Wallet balance
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(90,140,220,0.06)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "rgba(90,140,220,0.45)", fontSize: 10 }}
                    tickFormatter={(d) => {
                      try {
                        return format(parseISO(String(d)), "MMM d");
                      } catch {
                        return String(d);
                      }
                    }}
                    axisLine={{ stroke: "rgba(90,140,220,0.08)" }}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: "rgba(90,140,220,0.45)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v) =>
                      `${cs}${Number(v).toFixed(yTickDecimals)}`
                    }
                  />
                  <Tooltip content={<CapitalCurveTooltip currency={payload.currency} />} />
                  <Line
                    type="monotone"
                    dataKey="wallet"
                    stroke={BRAND_CURVE_STROKE}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    {...anim}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p
                className="text-[10px] text-center mt-3 px-4 leading-relaxed max-w-md mx-auto"
                style={{ color: "#475569" }}
              >
                Total exchange wallet shared by all your bots on this venue.
                <br />
                Includes bot trades, manual trades, deposits, withdrawals, and fees combined.
              </p>
              {!payload.hasWalletHistory && (
                <p className="text-[10px] text-center mt-2 px-4" style={{ color: "#334155" }}>
                  History builds as balance refreshes are recorded on this exchange.
                </p>
              )}
            </>
          )}
        </div>

        <div
          className="border-t px-4 py-4 sm:px-5 sm:py-5"
          style={{ borderColor: "rgba(90,140,220,0.12)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
            <p
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "#334155" }}
            >
              Bot comparison
            </p>
            {payload?.wallet.latest != null && (
              <div className="sm:text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>
                  Wallet now
                </p>
                <p className="text-lg font-black font-mono text-white">
                  {money(payload.wallet.latest, payload.currency)}
                </p>
              </div>
            )}
          </div>
          {loading && (
            <p className="text-xs" style={{ color: "#475569" }}>
              Loading…
            </p>
          )}
          {!loading && payload?.bots.length === 0 && (
            <p className="text-xs" style={{ color: "#475569" }}>
              No bots on this exchange.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {payload?.bots.map((b, i) => {
              const positive = b.totalPnlUsd >= 0;
              return (
                <div
                  key={b.deploymentId}
                  className="rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: "rgba(15,30,55,0.5)",
                    border: "1px solid rgba(90,140,220,0.1)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: BOT_COLORS[i % BOT_COLORS.length] }}
                    />
                    <span className="text-sm font-bold text-white truncate">{b.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <span style={{ color: "#475569" }}>P&amp;L</span>
                    <span
                      className="font-mono font-bold text-right"
                      style={{ color: positive ? "#34d399" : "#f87171" }}
                    >
                      {positive ? "+" : "−"}
                      {money(Math.abs(b.totalPnlUsd), payload.currency)}
                    </span>
                    <span style={{ color: "#475569" }}>Return</span>
                    <span className="font-mono font-bold text-right text-white">
                      {b.returnPct != null ? `${b.returnPct >= 0 ? "+" : ""}${b.returnPct.toFixed(1)}%` : "—"}
                    </span>
                    <span style={{ color: "#475569" }}>Running</span>
                    <span className="text-right" style={{ color: "#94a3b8" }}>
                      {runningDaysLabel(b.deployedAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
