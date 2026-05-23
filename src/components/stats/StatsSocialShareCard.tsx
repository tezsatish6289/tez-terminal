"use client";

import Image from "next/image";
import type { PerformanceMetrics } from "@/lib/performance-metrics";

/** LinkedIn-friendly landscape card (~1200×675) — screenshot as-is. */
const CARD_W = 1200;
const CARD_H = 675;

function fmtMoneyUsd(val: number): string {
  if (!Number.isFinite(val)) return "$0.00";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `-$${abs}` : `$${abs}`;
}

function fmtPct(val: number): string {
  if (!Number.isFinite(val)) return "0.00%";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function fmtRatio(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function ShareMetric({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="relative flex flex-col justify-center rounded-2xl px-6 py-5 overflow-hidden"
      style={{
        background: highlight
          ? "radial-gradient(ellipse at 30% 50%, rgba(52,211,153,0.35) 0%, rgba(15,23,42,0.95) 55%)"
          : "rgba(15,23,42,0.75)",
        border: highlight
          ? "1px solid rgba(52,211,153,0.35)"
          : "1px solid rgba(96,165,250,0.12)",
        boxShadow: highlight ? "0 0 40px rgba(52,211,153,0.15)" : undefined,
      }}
    >
      <span
        className="text-[13px] font-semibold mb-2"
        style={{ color: highlight ? "#a7f3d0" : "#94a3b8" }}
      >
        {label}
      </span>
      <span
        className="text-[32px] font-black tabular-nums leading-none tracking-tight"
        style={{ color: highlight ? "#ffffff" : "#f0f4ff" }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="text-[15px] font-bold mt-2 tabular-nums"
          style={{ color: "#34d399" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function ShareRatio({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col justify-center rounded-2xl px-6 py-4"
      style={{
        background: "rgba(15,23,42,0.75)",
        border: "1px solid rgba(96,165,250,0.12)",
      }}
    >
      <span className="text-[12px] font-semibold mb-1.5" style={{ color: "#94a3b8" }}>
        {label}
      </span>
      <span className="text-[26px] font-black tabular-nums" style={{ color: "#34d399" }}>
        {value}
      </span>
    </div>
  );
}

export interface StatsSocialShareCardProps {
  runningDays: number;
  startingCapital: number;
  totalReturnPct: number;
  pnlUsd: number;
  monthlyReturnPct: number;
  monthlyIsProjected: boolean;
  metrics: PerformanceMetrics | null;
  /** e.g. "Crypto Bot" when a per-bot filter is active */
  botSubtitle?: string;
}

export function StatsSocialShareCard({
  runningDays,
  startingCapital,
  totalReturnPct,
  pnlUsd,
  monthlyReturnPct,
  monthlyIsProjected,
  metrics,
  botSubtitle,
}: StatsSocialShareCardProps) {
  const title = botSubtitle
    ? `FreedomBot · ${botSubtitle} · Day ${runningDays}`
    : `FreedomBot · Day ${runningDays}`;

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: "#080f1e",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      {/* Grid + chart decoration */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(rgba(96,165,250,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(96,165,250,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <svg
        className="absolute bottom-0 left-0 right-0 h-[45%] w-full opacity-30"
        viewBox="0 0 1200 300"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="fbChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,220 C120,200 240,180 360,160 S600,120 720,100 S960,60 1200,40 L1200,300 L0,300 Z"
          fill="url(#fbChartFill)"
        />
        <path
          d="M0,220 C120,200 240,180 360,160 S600,120 720,100 S960,60 1200,40"
          fill="none"
          stroke="#34d399"
          strokeWidth="3"
        />
      </svg>

      <div className="relative z-10 flex flex-col h-full px-12 py-10">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-6">
          <Image
            src="/freedombot/icon.png"
            alt="FreedomBot"
            width={44}
            height={44}
            className="rounded-xl"
          />
          <span className="text-[22px] font-black tracking-tight" style={{ color: "#f0f4ff" }}>
            FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
          </span>
        </div>

        <h1
          className="text-[42px] font-black tracking-tight mb-8"
          style={{ color: "#ffffff" }}
        >
          {title}
        </h1>

        {/* Row 1 — headline KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-4 flex-1">
          <ShareMetric
            label="Live in Market"
            value={`${runningDays} Day${runningDays !== 1 ? "s" : ""}`}
            highlight
          />
          <ShareMetric
            label="Starting Capital"
            value={fmtMoneyUsd(startingCapital)}
          />
          <ShareMetric
            label="Total Return"
            value={fmtMoneyUsd(pnlUsd)}
            sub={`(${pnlUsd >= 0 ? "+" : ""}${fmtMoneyUsd(pnlUsd)}) · ${fmtPct(totalReturnPct)}`}
          />
          <ShareMetric
            label={`Monthly Return${monthlyIsProjected ? " (proj.)" : ""}`}
            value={fmtPct(monthlyReturnPct)}
          />
        </div>

        {/* Row 2 — risk ratios */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <ShareRatio
            label="Sharpe Ratio"
            value={metrics ? fmtRatio(metrics.sharpeRatio) : "—"}
          />
          <ShareRatio
            label="Sortino Ratio"
            value={metrics ? fmtRatio(metrics.sortinoRatio) : "—"}
          />
          <ShareRatio
            label="Calmar Ratio"
            value={metrics ? fmtRatio(metrics.calmarRatio) : "—"}
          />
          <ShareRatio
            label="Max Drawdown"
            value={metrics ? `-${metrics.maxDrawdownPct.toFixed(2)}%` : "—"}
          />
        </div>

        {/* Footer */}
        <div className="text-center space-y-2 mt-auto">
          <p className="text-[17px] font-bold" style={{ color: "#f0f4ff" }}>
            Public. Verifiable. Yours to control. No trust me bro — only transparency.
          </p>
          <p className="text-[13px] font-medium" style={{ color: "#64748b" }}>
            Available on Bybit · CoinDCX · Hyperliquid
          </p>
        </div>
      </div>

      {/* Watermark */}
      <div className="absolute bottom-6 right-8 opacity-20">
        <Image src="/freedombot/icon.png" alt="" width={36} height={36} className="rounded-lg" />
      </div>
    </div>
  );
}
