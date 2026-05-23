"use client";

import Image from "next/image";

/** LinkedIn landscape — 1200×720 */
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
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% 120%, #1e3a5f 0%, #0a1628 35%, #050810 70%, #020408 100%)",
        }}
      />
      <div
        className="absolute -right-[10%] top-[5%] w-[55%] h-[70%] opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, rgba(139,92,246,0.45) 0%, rgba(59,130,246,0.25) 35%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute -left-[15%] bottom-[10%] w-[50%] h-[50%] opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at 40% 60%, rgba(96,165,250,0.35) 0%, transparent 65%)",
          filter: "blur(50px)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-[38%]"
        style={{
          background:
            "radial-gradient(ellipse 90% 100% at 50% 100%, rgba(59,130,246,0.35) 0%, rgba(15,23,42,0.6) 45%, transparent 72%)",
        }}
      />
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
      <svg className="absolute left-[4%] bottom-[12%] w-32 h-52 opacity-25" viewBox="0 0 80 140" fill="none">
        <path d="M40 10 L48 90 L40 130 L32 90 Z" fill="#94a3b8" />
        <ellipse cx="40" cy="125" rx="18" ry="28" fill="#f97316" opacity="0.6" />
      </svg>
      <svg className="absolute right-[5%] bottom-[14%] w-28 h-44 opacity-20" viewBox="0 0 80 140" fill="none">
        <path d="M40 10 L48 90 L40 130 L32 90 Z" fill="#64748b" />
        <ellipse cx="40" cy="125" rx="16" ry="24" fill="#fb923c" opacity="0.5" />
      </svg>
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 100px rgba(0,0,0,0.5)" }} />
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
      className="flex flex-col justify-between rounded-2xl px-4 py-5 h-full min-h-[168px]"
      style={{
        background: "rgba(8,15,30,0.82)",
        border: "1px solid rgba(96,165,250,0.22)",
        backdropFilter: "blur(10px)",
      }}
    >
      <span
        className="text-[11px] font-bold uppercase tracking-widest leading-tight"
        style={{ color: "#94a3b8" }}
      >
        {label}
      </span>
      <span
        className="text-[34px] font-black tabular-nums leading-none tracking-tight my-2"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      <div className="flex flex-col gap-1.5">
        {sub && (
          <span className="text-[11px] font-medium leading-snug" style={{ color: "#64748b" }}>
            {sub}
          </span>
        )}
        {badge && (
          <span
            className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md w-fit"
            style={
              badge.tone === "live"
                ? {
                    backgroundColor: "rgba(34,197,94,0.22)",
                    color: "#34d399",
                    border: "1px solid rgba(34,197,94,0.4)",
                  }
                : {
                    backgroundColor: "rgba(251,191,36,0.18)",
                    color: "#fbbf24",
                    border: "1px solid rgba(251,191,36,0.35)",
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
  const headline = botSubtitle
    ? `${botSubtitle} · Day ${runningDays}`
    : `Day ${runningDays}`;

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

      <div className="relative z-10 flex flex-col h-full px-8 py-7">
        {/* Header — brand once (logo + .ai), headline without repeating FreedomBot */}
        <div className="flex items-center justify-between gap-6 mb-6 shrink-0">
          <div className="flex items-center gap-4">
            <Image
              src="/freedombot/icon.png"
              alt="FreedomBot"
              width={56}
              height={56}
              className="rounded-2xl shadow-lg shadow-blue-500/25"
            />
            <span className="text-[32px] font-black tracking-tight" style={{ color: "#f0f4ff" }}>
              FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
            </span>
          </div>
          <h1
            className="text-[38px] font-black tracking-tight text-right leading-none"
            style={{ color: "#ffffff" }}
          >
            {headline}
          </h1>
        </div>

        {/* Six KPIs — fill vertical space */}
        <div className="grid grid-cols-6 gap-3 flex-1 min-h-0 mb-4">
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
            sub={monthlyIsProjected ? `from ${runningDays}-day track` : "this calendar month"}
            valueColor={monthlyReturnPct >= 0 ? green : "#f87171"}
            badge={monthlyIsProjected ? { text: "Projected", tone: "projected" } : undefined}
          />
          <KpiTile
            label="Annualized Return"
            value={fmtPct(yearlyReturnPct)}
            sub={yearlyIsProjected ? `from ${runningDays}-day track` : "actual 12-month"}
            valueColor={yearlyReturnPct >= 0 ? green : "#f87171"}
            badge={yearlyIsProjected ? { text: "Projected", tone: "projected" } : undefined}
          />
        </div>

        {/* Sharpe */}
        <div
          className="flex items-center justify-between rounded-2xl px-8 py-6 mb-4 shrink-0"
          style={{
            background: "rgba(8,15,30,0.85)",
            border: "1px solid rgba(52,211,153,0.3)",
            backdropFilter: "blur(10px)",
          }}
        >
          <span
            className="text-[14px] font-bold uppercase tracking-widest"
            style={{ color: "#94a3b8" }}
          >
            Sharpe Ratio
          </span>
          <span
            className="text-[52px] font-black tabular-nums leading-none"
            style={{ color: green }}
          >
            {sharpeRatio != null ? fmtRatio(sharpeRatio) : "—"}
          </span>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2 shrink-0">
          <p className="text-[18px] font-bold leading-snug" style={{ color: "#f0f4ff" }}>
            Transparent performance. Verifiable trades. You stay in control.
          </p>
          <p className="text-[14px] font-semibold" style={{ color: "#64748b" }}>
            Available on Bybit · CoinDCX · Hyperliquid
          </p>
        </div>
      </div>
    </div>
  );
}
