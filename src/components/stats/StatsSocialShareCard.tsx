"use client";

import Image from "next/image";

const CARD_W = 1200;
const CARD_H = 720;
const GREEN = "#34d399";
const GREEN_GLOW = "0 0 16px rgba(52,211,153,0.4), 0 0 32px rgba(52,211,153,0.12)";
const CARD_BG = "rgba(6,12,24,0.88)";
const CARD_BORDER = "1px solid rgba(52,211,153,0.22)";

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

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background: CARD_BG,
        border: CARD_BORDER,
        backdropFilter: "blur(12px)",
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-[0.12em] block mb-1.5"
      style={{ color: "#94a3b8" }}
    >
      {children}
    </span>
  );
}

function GlowValue({
  children,
  size = "lg",
}: {
  children: React.ReactNode;
  size?: "xl" | "lg" | "md" | "sm";
}) {
  const sizes = { xl: "46px", lg: "28px", md: "22px", sm: "18px" };
  return (
    <span
      className="font-black tabular-nums leading-tight block mt-0.5"
      style={{
        fontSize: sizes[size],
        color: GREEN,
        textShadow: GREEN_GLOW,
      }}
    >
      {children}
    </span>
  );
}

/** Decorative area fill inside Current Capital card only */
function MiniEquitySparkline() {
  return (
    <svg
      className="absolute bottom-0 left-0 right-0 h-[55%] w-full pointer-events-none"
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,90 L40,85 L90,70 L140,75 L200,50 L260,45 L320,30 L400,15 L400,120 L0,120 Z"
        fill="url(#sparkFill)"
      />
      <path
        d="M0,90 L40,85 L90,70 L140,75 L200,50 L260,45 L320,30 L400,15"
        fill="none"
        stroke="#34d399"
        strokeWidth="2.5"
        opacity="0.7"
      />
    </svg>
  );
}

function SharpeGauge({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 4);
  const pct = clamped / 4;
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = pct * c * 0.75;
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-1">
      <svg width="118" height="118" viewBox="0 0 150 150" className="drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]">
        <circle
          cx="75"
          cy="75"
          r={r}
          fill="none"
          stroke="rgba(52,211,153,0.15)"
          strokeWidth="8"
          strokeLinecap="round"
          transform="rotate(135 75 75)"
          strokeDasharray={`${c * 0.75} ${c}`}
        />
        <circle
          cx="75"
          cy="75"
          r={r}
          fill="none"
          stroke="#34d399"
          strokeWidth="8"
          strokeLinecap="round"
          transform="rotate(135 75 75)"
          strokeDasharray={`${dash} ${c}`}
          style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.6))" }}
        />
        <text
          x="75"
          y="82"
          textAnchor="middle"
          fill="#34d399"
          fontSize="22"
          fontWeight="800"
          style={{ textShadow: "0 0 12px rgba(52,211,153,0.5)" }}
        >
          {fmtRatio(value)}
        </text>
      </svg>
    </div>
  );
}

function CinematicBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 90% at 50% 110%, #0f2847 0%, #060d18 45%, #030508 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(1px 1px at 78% 22%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 45% 8%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1px 1px at 88% 70%, rgba(255,255,255,0.45) 0%, transparent 100%)
          `,
        }}
      />
      <div
        className="absolute -right-[5%] top-0 w-[45%] h-[60%] opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.4) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
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
  const pnlPositive = pnlUsd >= 0;

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

      <div className="relative z-10 flex flex-col h-full p-7 gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Image
              src="/freedombot/icon.png"
              alt="FreedomBot"
              width={52}
              height={52}
              className="rounded-xl"
            />
            <span className="text-[30px] font-black tracking-tight" style={{ color: "#f8fafc" }}>
              FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[32px] font-black leading-none" style={{ color: "#f8fafc" }}>
                Day {runningDays}
              </span>
              {botSubtitle && (
                <span
                  className="block text-[13px] font-semibold mt-1"
                  style={{ color: "#64748b" }}
                >
                  {botSubtitle}
                </span>
              )}
            </div>
            <span
              className="text-[13px] font-black uppercase tracking-wider px-4 py-2 rounded-full"
              style={{
                color: GREEN,
                backgroundColor: "rgba(34,197,94,0.15)",
                border: `1px solid rgba(52,211,153,0.45)`,
                boxShadow: "0 0 16px rgba(52,211,153,0.25)",
              }}
            >
              Live
            </span>
          </div>
        </div>

        {/* Bento body */}
        <div
          className="flex-1 grid gap-3 min-h-0"
          style={{
            gridTemplateColumns: "248px 1fr",
            gridTemplateRows: "1fr 210px",
          }}
        >
          {/* Left column — Running + Starting */}
          <div className="flex flex-col gap-3 row-span-2 min-h-0">
            <Panel className="flex-1 flex flex-col justify-center px-6 py-5">
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 100%, rgba(52,211,153,0.3) 0%, transparent 70%)",
                }}
              />
              <Label>Running</Label>
              <GlowValue size="lg">{runningDays}</GlowValue>
              <span className="text-[18px] font-bold mt-1" style={{ color: "#e2e8f0" }}>
                Days
              </span>
            </Panel>
            <Panel className="flex flex-col justify-center px-6 py-5">
              <Label>Starting Capital</Label>
              <span className="text-[28px] font-black tabular-nums leading-none text-white">
                {fmtMoneyUsd(startingCapital)}
              </span>
              <span className="text-[12px] font-medium mt-2" style={{ color: "#64748b" }}>
                Initial investment
              </span>
            </Panel>
          </div>

          {/* Current capital — hero */}
          <Panel className="flex flex-col justify-between px-8 py-6 min-h-0">
            <MiniEquitySparkline />
            <div className="relative z-10">
              <Label>Current Capital</Label>
              <GlowValue size="lg">{fmtMoneyUsd(currentCapital)}</GlowValue>
              <p className="text-[15px] font-semibold mt-2 tabular-nums" style={{ color: GREEN }}>
                {pnlPositive ? "+" : ""}
                {fmtMoneyUsd(pnlUsd)} overall ({fmtPct(totalReturnPct)})
              </p>
            </div>
          </Panel>

          {/* Bottom row */}
          <div className="grid grid-cols-[200px_1fr] gap-3 min-h-0">
            <Panel className="flex flex-col px-4 py-4">
              <Label>Sharpe Ratio</Label>
              {sharpeRatio != null ? (
                <SharpeGauge value={sharpeRatio} />
              ) : (
                <span className="text-3xl font-black text-center py-8" style={{ color: GREEN }}>
                  —
                </span>
              )}
            </Panel>

            <Panel className="flex flex-col px-6 py-4 justify-between gap-2">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <Label>Total Return</Label>
                  <GlowValue size="sm">{fmtPct(totalReturnPct)}</GlowValue>
                </div>
                <div>
                  <Label>Monthly Return</Label>
                  <GlowValue size="sm">{fmtPct(monthlyReturnPct)}</GlowValue>
                </div>
              </div>
              <div className="mt-2 pt-3 border-t border-white/[0.08]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Label>Annualized Return</Label>
                  {yearlyIsProjected && (
                    <span
                      className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
                      style={{
                        color: "#94a3b8",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      Projected
                    </span>
                  )}
                </div>
                <GlowValue size="md">{fmtPct(yearlyReturnPct)}</GlowValue>
              </div>
            </Panel>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center shrink-0 pt-1">
          <p className="text-[17px] font-bold leading-snug" style={{ color: "#f1f5f9" }}>
            Transparent performance. Verifiable trades. You stay in control.
          </p>
          <p className="text-[13px] font-semibold mt-1.5" style={{ color: "#64748b" }}>
            Available on Bybit · CoinDCX · Hyperliquid
          </p>
        </div>
      </div>
    </div>
  );
}
