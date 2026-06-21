"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, ShieldAlert, RefreshCw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import { FNO_ACCENT, FNO_MUTED, FNO_TEXT, FNO_CARD_BG } from "@/lib/fnoninja/theme";

interface StrategyEconomics {
  netDebit: number;
  kind: "debit" | "credit" | "flat";
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  riskReward: number | null;
  scenario?: { label: string; pnl: number; rewardRisk?: number | null } | null;
}

interface FynnStrategy {
  name: string;
  stance: "bullish" | "bearish" | "neutral" | "volatility";
  whyNow: string;
  structure: string;
  maxRisk: string;
  maxReward: string;
  invalidation: string;
  economics?: StrategyEconomics | null;
}

interface FynnPlan {
  bias: "bullish" | "lean-bullish" | "neutral" | "lean-bearish" | "bearish";
  headline: string;
  rationale: string;
  keyLevels: {
    support: string | null;
    resistance: string | null;
    maxPain: string | null;
    putWall: string | null;
    callWall: string | null;
  };
  strategies: FynnStrategy[];
  caveats: string[];
}

type FynnMode = "options" | "futures";

const FYNN_MODES: { id: FynnMode; label: string }[] = [
  { id: "options", label: "Options · hedged" },
  { id: "futures", label: "Futures · hedged" },
];

interface FynnResponse {
  plan?: FynnPlan;
  label?: string;
  mode?: FynnMode;
  pricing?: "estimated" | "unavailable";
  disclaimer?: string;
  error?: string;
}

interface ModeState {
  data?: FynnResponse;
  error?: string;
}

function fmtMoney(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtLevel(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
}

const BIAS_COLOR: Record<FynnPlan["bias"], string> = {
  bullish: "#34d399",
  "lean-bullish": "#6ee7b7",
  neutral: "#94a3b8",
  "lean-bearish": "#fca5a5",
  bearish: "#f87171",
};

const STANCE_COLOR: Record<FynnStrategy["stance"], string> = {
  bullish: "#34d399",
  bearish: "#f87171",
  neutral: "#94a3b8",
  volatility: "#c084fc",
};

const CARD_STYLE = {
  backgroundColor: "rgba(13, 27, 46, 0.85)",
  border: "1px solid rgba(96,165,250,0.18)",
  boxShadow: "0 0 20px rgba(96,165,250,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
} as const;

export function AskFynn({
  scope,
  symbol,
  label,
  iconOnly = false,
  onOpenChange,
}: {
  scope: LevelsTvScope;
  symbol: string;
  label?: string;
  /** Icon-only trigger — favslide / liveslide header. */
  iconOnly?: boolean;
  /** Notify parent (e.g. pause slideshow timer while open). */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FynnMode>("options");
  const [loadingMode, setLoadingMode] = useState<FynnMode | null>(null);
  const [byMode, setByMode] = useState<Record<FynnMode, ModeState>>({
    options: {},
    futures: {},
  });

  /** Slideshow: discard cached plans when the active symbol changes. */
  useEffect(() => {
    setByMode({ options: {}, futures: {} });
    setLoadingMode(null);
    setMode("options");
    setOpen(false);
    onOpenChange?.(false);
  }, [scope, symbol, onOpenChange]);

  const ask = useCallback(
    async (target: FynnMode, force = false) => {
      if (!force) {
        if (byMode[target].data || loadingMode === target) return;
      }
      setLoadingMode(target);
      setByMode((prev) => ({ ...prev, [target]: { ...prev[target], error: undefined } }));
      try {
        const res = await fetch("/api/freedombot/levels/fynn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, symbol, mode: target }),
          cache: "no-store",
        });
        const json = (await res.json()) as FynnResponse;
        if (!res.ok || !json.plan) {
          setByMode((prev) => ({
            ...prev,
            [target]: { error: json.error ?? "Fynn couldn't put together a plan right now." },
          }));
          return;
        }
        setByMode((prev) => ({ ...prev, [target]: { data: json } }));
      } catch {
        setByMode((prev) => ({
          ...prev,
          [target]: { error: "Network error reaching Fynn. Please try again." },
        }));
      } finally {
        setLoadingMode((curr) => (curr === target ? null : curr));
      }
    },
    [scope, symbol, byMode, loadingMode],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
      if (next && !byMode[mode].data && loadingMode !== mode) void ask(mode);
    },
    [ask, byMode, mode, loadingMode, onOpenChange],
  );

  const handleSelectMode = useCallback(
    (next: FynnMode) => {
      setMode(next);
      if (!byMode[next].data && loadingMode !== next) void ask(next);
    },
    [ask, byMode, loadingMode],
  );

  const current = byMode[mode];
  const data = current.data ?? null;
  const error = current.error ?? null;
  const loading = loadingMode === mode;
  const plan = data?.plan;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={
          iconOnly
            ? "inline-flex items-center justify-center h-8 w-8 rounded-full transition-all hover:scale-[1.06] shrink-0"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] shrink-0"
        }
        style={{
          color: FNO_ACCENT,
          backgroundColor: "rgba(96,165,250,0.1)",
          border: "1px solid rgba(96,165,250,0.4)",
          boxShadow: open
            ? "0 0 20px rgba(96,165,250,0.35), inset 0 0 12px rgba(96,165,250,0.08)"
            : "0 0 12px rgba(96,165,250,0.12)",
        }}
        aria-label={`Ask Fynn about ${symbol}`}
        title="Ask Fynn — hedged strategy ideas for this symbol"
      >
        <Sparkles
          className={iconOnly ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"}
          strokeWidth={2}
          style={{ filter: open ? "drop-shadow(0 0 6px rgba(96,165,250,0.8))" : undefined }}
        />
        {!iconOnly ? <span className="whitespace-nowrap">Ask Fynn</span> : null}
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="fynn-ai-pane w-full sm:max-w-md overflow-y-auto border-l p-0 z-[210] !top-14 sm:!top-16 !bottom-0 !h-[calc(100dvh-3.5rem)] sm:!h-[calc(100dvh-4rem)] max-h-none"
        >
          {/* Ambient glow + grid texture */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div
              className="absolute -top-28 -right-20 h-72 w-72 rounded-full blur-3xl fynn-glow-pulse"
              style={{ background: "radial-gradient(circle, rgba(96,165,250,0.18) 0%, transparent 70%)" }}
            />
            <div
              className="absolute top-[38%] -left-24 h-56 w-56 rounded-full blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)" }}
            />
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(96,165,250,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.04) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(96,165,250,0.5) 20%, rgba(167,139,250,0.6) 50%, rgba(96,165,250,0.5) 80%, transparent)",
              }}
            />
          </div>

          <div className="relative p-5 sm:p-6 pr-12">
            <SheetHeader className="text-left space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                  style={{
                    color: "#bfdbfe",
                    background: "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.15))",
                    border: "1px solid rgba(96,165,250,0.35)",
                    boxShadow: "0 0 16px rgba(96,165,250,0.2)",
                  }}
                >
                  <Sparkles className="h-3 w-3" style={{ color: FNO_ACCENT }} />
                  AI Coach
                </span>
              </div>
              <SheetTitle
                className="flex items-center gap-2 text-base"
                style={{
                  color: FNO_TEXT,
                  textShadow: "0 0 24px rgba(96,165,250,0.15)",
                }}
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                  style={{
                    background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.12))",
                    border: "1px solid rgba(96,165,250,0.3)",
                    boxShadow: "0 0 12px rgba(96,165,250,0.15)",
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" style={{ color: FNO_ACCENT }} />
                </span>
                Fynn · {label || symbol}
              </SheetTitle>
              <SheetDescription style={{ color: FNO_MUTED }}>
                Hedged strategy ideas from this symbol&apos;s zones, OI walls and IV regime.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Strategy mode">
              {FYNN_MODES.map((m) => {
                const active = m.id === mode;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSelectMode(m.id)}
                    className="flex-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all"
                    style={{
                      color: active ? "#e0f2fe" : FNO_MUTED,
                      background: active
                        ? "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(96,165,250,0.12))"
                        : "transparent",
                      border: `1px solid ${active ? "rgba(96,165,250,0.45)" : "rgba(90,140,220,0.2)"}`,
                      boxShadow: active ? "0 0 14px rgba(96,165,250,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" : undefined,
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-4">
              {loading ? (
                <div
                  className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl"
                  style={{
                    color: FNO_MUTED,
                    border: "1px solid rgba(96,165,250,0.15)",
                    background: "rgba(96,165,250,0.04)",
                    boxShadow: "inset 0 0 40px rgba(96,165,250,0.06)",
                  }}
                >
                  <div className="relative">
                    <div
                      className="absolute inset-0 rounded-full blur-md fynn-glow-pulse"
                      style={{ background: "rgba(96,165,250,0.4)" }}
                    />
                    <Loader2
                      className="relative h-7 w-7 animate-spin"
                      style={{ color: FNO_ACCENT, filter: "drop-shadow(0 0 8px rgba(96,165,250,0.6))" }}
                    />
                  </div>
                  <p className="text-xs">Fynn is reading the option data…</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <ShieldAlert className="h-7 w-7" style={{ color: "#f87171" }} />
                  <p className="text-xs" style={{ color: "#fca5a5" }}>
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={() => void ask(mode, true)}
                    className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                    style={{
                      color: FNO_ACCENT,
                      border: "1px solid rgba(96,165,250,0.4)",
                    }}
                  >
                    <RefreshCw className="h-3 w-3" /> Try again
                  </button>
                </div>
              ) : plan ? (
                <FynnPlanView plan={plan} onRefresh={() => void ask(mode, true)} />
              ) : null}
            </div>

            {data?.disclaimer ? (
              <p
                className="mt-6 text-[10px] leading-relaxed"
                style={{ color: FNO_MUTED }}
              >
                {data.disclaimer}
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function FynnPlanView({ plan, onRefresh }: { plan: FynnPlan; onRefresh: () => void }) {
  const biasColor = BIAS_COLOR[plan.bias] ?? FNO_MUTED;
  const levelRows: [string, string | null][] = [
    ["Support", plan.keyLevels.support],
    ["Resistance", plan.keyLevels.resistance],
    ["Max pain", plan.keyLevels.maxPain],
    ["Put OI wall", plan.keyLevels.putWall],
    ["Call OI wall", plan.keyLevels.callWall],
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
          style={{ color: biasColor, border: `1px solid ${biasColor}55`, backgroundColor: `${biasColor}1a` }}
        >
          {plan.bias.replace("-", " ")}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 text-[10px]"
          style={{ color: FNO_MUTED }}
          title="Regenerate"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <p className="text-sm font-semibold" style={{ color: FNO_TEXT }}>
        {plan.headline}
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
        {plan.rationale}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {levelRows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="rounded-lg px-3 py-2" style={CARD_STYLE}>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: FNO_MUTED }}>
                {k}
              </p>
              <p className="text-xs font-semibold" style={{ color: FNO_TEXT }}>
                {v}
              </p>
            </div>
          ))}
      </div>

      <div className="space-y-3">
        {plan.strategies.map((s, i) => {
          const stanceColor = STANCE_COLOR[s.stance] ?? FNO_MUTED;
          return (
            <div key={`${s.name}-${i}`} className="rounded-xl p-3.5" style={CARD_STYLE}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold" style={{ color: FNO_TEXT }}>
                  {s.name}
                </p>
                <span
                  className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ color: stanceColor, backgroundColor: `${stanceColor}1a` }}
                >
                  {s.stance}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
                {s.whyNow}
              </p>
              <div
                className="mt-2 rounded-lg px-2.5 py-2 text-[11px] font-mono"
                style={{
                  background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.06))",
                  color: "#bfdbfe",
                  border: "1px solid rgba(96,165,250,0.2)",
                  boxShadow: "0 0 16px rgba(96,165,250,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                {s.structure}
              </div>
              <dl className="mt-2.5 space-y-1 text-[11px]">
                {s.economics ? (
                  <StrategyEconomicsRows econ={s.economics} />
                ) : (
                  <>
                    <PlanRow label="Max risk" value={s.maxRisk} />
                    <PlanRow label="Max reward" value={s.maxReward} />
                  </>
                )}
                <PlanRow label="Invalidation" value={s.invalidation} valueColor="#fca5a5" />
              </dl>
            </div>
          );
        })}
      </div>

      {plan.caveats.length > 0 ? (
        <div className="rounded-xl p-3.5" style={{ ...CARD_STYLE, borderColor: "rgba(251,191,36,0.3)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#fcd34d" }}>
            Watch-outs
          </p>
          <ul className="space-y-1">
            {plan.caveats.map((c, i) => (
              <li key={i} className="text-[11px] leading-relaxed flex gap-1.5" style={{ color: "#cbd5e1" }}>
                <span style={{ color: "#fcd34d" }}>•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function StrategyEconomicsRows({ econ }: { econ: StrategyEconomics }) {
  const risk = econ.maxLoss == null ? "Unbounded" : `${fmtMoney(econ.maxLoss)} / share`;
  const reward =
    econ.maxProfit == null
      ? econ.scenario
        ? "Open-ended"
        : "Unbounded"
      : `${fmtMoney(econ.maxProfit)} / share`;
  const net =
    econ.kind === "flat"
      ? null
      : `${fmtMoney(Math.abs(econ.netDebit))} / share ${econ.kind}`;
  return (
    <>
      {net ? <PlanRow label="Net" value={net} /> : null}
      <PlanRow label="Max risk" value={risk} valueColor="#fca5a5" />
      <PlanRow label="Max reward" value={reward} valueColor="#6ee7b7" />
      {econ.scenario ? (
        <div className="flex flex-wrap items-baseline gap-x-1.5" style={{ color: FNO_MUTED }}>
          <span>{econ.scenario.label} →</span>
          <span
            className="font-semibold"
            style={{ color: econ.scenario.pnl >= 0 ? "#6ee7b7" : "#fca5a5" }}
          >
            {econ.scenario.pnl >= 0 ? "+" : ""}
            {fmtMoney(econ.scenario.pnl)} / share
          </span>
          {econ.scenario.rewardRisk != null ? (
            <span>(~{econ.scenario.rewardRisk} : 1 vs risk)</span>
          ) : null}
        </div>
      ) : null}
      {econ.breakevens.length > 0 ? (
        <PlanRow label="Break-even" value={econ.breakevens.map(fmtLevel).join(" / ")} />
      ) : null}
      {econ.riskReward != null ? (
        <PlanRow label="Reward:risk" value={`${econ.riskReward} : 1`} />
      ) : null}
      <p className="text-[9px] pt-0.5" style={{ color: FNO_MUTED }}>
        Estimated from ATM IV (Black-Scholes), per share — multiply by lot size for total.
      </p>
    </>
  );
}

function PlanRow({
  label,
  value,
  valueColor = "#e2e8f0",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 w-20" style={{ color: FNO_MUTED }}>
        {label}
      </dt>
      <dd style={{ color: valueColor }}>{value}</dd>
    </div>
  );
}
