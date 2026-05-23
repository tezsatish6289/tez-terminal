"use client";

import Image from "next/image";

/** LinkedIn landscape — 1200×720 for six KPI tiles + Sharpe + footer */
const CARD_W = 1200;
const CARD_H = 720;

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
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function CinematicBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* Deep space base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% 120%, #1e3a5f 0%, #0a1628 35%, #050810 70%, #020408 100%)",
        }}
      />
      {/* Nebula — right */}
      <div
        className="absolute -right-[10%] top-[5%] w-[55%] h-[70%] opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, rgba(139,92,246,0.45) 0%, rgba(59,130,246,0.25) 35%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      {/* Nebula — left accent */}
      <div
        className="absolute -left-[15%] bottom-[10%] w-[50%] h-[50%] opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at 40% 60%, rgba(96,165,250,0.35) 0%, transparent 65%)",
          filter: "blur(50px)",
        }}
      />
      {/* Earth horizon glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[38%]"
        style={{
          background:
            "radial-gradient(ellipse 90% 100% at 50% 100%, rgba(59,130,246,0.35) 0%, rgba(15,23,42,0.6) 45%, transparent 72%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-[22%] opacity-40"
        style={{
          background:
            "linear-gradient(to top, rgba(34,197,94,0.08) 0%, transparent 100%)",
        }}
      />
      {/* Stars */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.9) 0%, transparent 100%),
            radial-gradient(1px 1px at 25% 65%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 40% 15%, rgba(255,255,255,0.85) 0%, transparent 100%),
            radial-gradient(1px 1px at 55% 45%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 70% 25%, rgba(255,255,255,0.75) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 85% 55%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(1px 1px at 92% 12%, rgba(255,255,255,0.65) 0%, transparent 100%),
            radial-gradient(1px 1px at 15% 88%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 48% 78%, rgba(255,255,255,0.55) 0%, transparent 100%),
            radial-gradient(1px 1px at 78% 82%, rgba(255,255,255,0.45) 0%, transparent 100%)
          `,
        }}
      />
      {/* Subtle launch streaks (abstract, not branded rockets) */}
      <svg className="absolute left-[4%] bottom-[18%] w-28 h-48 opacity-25" viewBox="0 0 80 140" fill="none">
        <path d="M40 10 L48 90 L40 130 L32 90 Z" fill="url(#rocketGrad)" />
        <ellipse cx="40" cy="125" rx="18" ry="28" fill="url(#flameGrad)" opacity="0.8" />
        <defs>
          <linearGradient id="rocketGrad" x1="40" y1="10" x2="40" y2="130">
            <stop stopColor="#94a3b8" />
            <stop offset="1" stopColor="#475569" />
          </linearGradient>
          <radialGradient id="flameGrad" cx="0.5" cy="0.2" r="0.8">
            <stop stopColor="#fbbf24" />
            <stop offset="1" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      <svg className="absolute right-[6%] bottom-[22%] w-24 h-40 opacity-20" viewBox="0 0 80 140" fill="none">
        <path d="M40 10 L48 90 L40 130 L32 90 Z" fill="#64748b" />
        <ellipse cx="40" cy="125" rx="16" ry="24" fill="#fb923c" opacity="0.5" />
      </svg>
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: "inset 0 0 120px rgba(0,0,0,0.55)",
        }}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  valueColor = "#f0f4ff",
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  badge?: { text: string; tone: "live" | "projected" };
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl px-3 py-3.5 min-h-[108px]"
      style={{
        background: "rgba(8,15,30,0.72)",
        border: "1px solid rgba(96,165,250,0.18)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-widest leading-tight"
        style={{ color: "#64748b" }}
      >
        {label}
      </span>
      <span
        className="text-[22px] font-black tabular-nums leading-none tracking-tight"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      <div className="flex flex-col gap-1 mt-auto">
        {sub && (
          <span className="text-[9px] leading-snug" style={{ color: "#64748b" }}>
            {sub}
          </span>
        )}
        {badge && (
          <span
            className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded w-fit"
            style={
              badge.tone === "live"
                ? {
                    backgroundColor: "rgba(34,197,94,0.2)",
                    color: "#34d399",
                    border: "1px solid rgba(34,197,94,0.35)",
                  }
                : {
                    backgroundColor: "rgba(251,191,36,0.15)",
                    color: "#fbbf24",
                    border: "1px solid rgba(251,191,36,0.3)",
                  }
            }
          >
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

export interface StatsSocialShareCardProps {
  runningDays: number;
  startingCapital: number;
  currentCapital: number;
  totalReturnPct: number;
  pnlUsd: number;
  monthlyReturnPct: number;
  monthlyIsProjected: boolean;
  yearlyReturnPct: number;
  yearlyIsProjected: boolean;
  sharpeRatio: number | null;
  /** e.g. "Crypto Bot" when a per-bot filter is active */
  botSubtitle?: string;
}

export function StatsSocialShareCard({
  runningDays,
  startingCapital,
  currentCapital,
  totalReturnPct,
  pnlUsd,
  monthlyReturnPct,
  monthlyIsProjected,
  yearlyReturnPct,
  yearlyIsProjected,
  sharpeRatio,
  botSubtitle,
}: StatsSocialShareCardProps) {
  const title = botSubtitle
    ? `FreedomBot · ${botSubtitle} · Day ${runningDays}`
    : `FreedomBot · Day ${runningDays}`;

  const positive = currentCapital >= startingCapital;
  const green = "#34d399";

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: CARD_W,
        height: CARD_H,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <CinematicBackground />

      <div className="relative z-10 flex flex-col h-full px-10 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Image
              src="/freedombot/icon.png"
              alt="FreedomBot"
              width={40}
              height={40}
              className="rounded-xl shadow-lg shadow-blue-500/20"
            />
            <div>
              <span className="text-[20px] font-black tracking-tight block" style={{ color: "#f0f4ff" }}>
                FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
              </span>
              <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>
                Live simulator performance
              </span>
            </div>
          </div>
          <h1
            className="text-[26px] font-black tracking-tight text-right max-w-[480px] leading-tight"
            style={{ color: "#ffffff" }}
          >
            {title}
          </h1>
        </div>

        {/* Six KPIs — same story as /stats */}
        <div className="grid grid-cols-6 gap-2.5 mb-4">
          <KpiTile
            label="Running"
            value={`${runningDays} Day${runningDays !== 1 ? "s" : ""}`}
            sub="simulator active"
            badge={{ text: "Live", tone: "live" }}
          />
          <KpiTile
            label="Starting Capital"
            value={fmtMoneyUsd(startingCapital)}
            sub="initial investment"
          />
          <KpiTile
            label="Current Capital"
            value={fmtMoneyUsd(currentCapital)}
            sub={`${pnlUsd >= 0 ? "+" : ""}${fmtMoneyUsd(pnlUsd)} overall`}
            valueColor={positive ? green : "#f87171"}
          />
          <KpiTile
            label="Total Return"
            value={fmtPct(totalReturnPct)}
            sub={`across ${runningDays} day${runningDays !== 1 ? "s" : ""}`}
            valueColor={totalReturnPct >= 0 ? green : "#f87171"}
          />
          <KpiTile
            label="Monthly Return"
            value={fmtPct(monthlyReturnPct)}
            sub={monthlyIsProjected ? `compounded from ${runningDays}-day live` : "this calendar month"}
            valueColor={monthlyReturnPct >= 0 ? green : "#f87171"}
            badge={monthlyIsProjected ? { text: "Projected", tone: "projected" } : undefined}
          />
          <KpiTile
            label="Annualized Return"
            value={fmtPct(yearlyReturnPct)}
            sub={
              yearlyIsProjected
                ? `compounded from ${runningDays}-day live`
                : "actual 12-month"
            }
            valueColor={yearlyReturnPct >= 0 ? green : "#f87171"}
            badge={yearlyIsProjected ? { text: "Projected", tone: "projected" } : undefined}
          />
        </div>

        {/* Sharpe only */}
        <div
          className="flex items-center justify-between rounded-xl px-6 py-4 mb-5"
          style={{
            background: "rgba(8,15,30,0.78)",
            border: "1px solid rgba(52,211,153,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div>
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "#64748b" }}
            >
              Sharpe Ratio
            </span>
            <p className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>
              Risk-adjusted return · annualised · closed trades only
            </p>
          </div>
          <span
            className="text-[40px] font-black tabular-nums"
            style={{ color: green }}
          >
            {sharpeRatio != null ? fmtRatio(sharpeRatio) : "—"}
          </span>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2 mt-auto pt-2">
          <p className="text-[16px] font-bold leading-snug" style={{ color: "#f0f4ff" }}>
            Transparent performance. Verifiable trades. You stay in control.
          </p>
          <p className="text-[12px] font-medium" style={{ color: "#64748b" }}>
            Available on Bybit · CoinDCX · Hyperliquid
          </p>
        </div>
      </div>
    </div>
  );
}
