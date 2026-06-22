"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  HelpCircle,
  LineChart,
  Loader2,
  Plus,
  Minus,
  Sparkles,
  ShieldAlert,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
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

/** What the user explicitly asked for. "menu" fetches nothing. */
type AtlasView = "menu" | "options" | "futures" | "faq";

const FYNN_MODES: { id: FynnMode; label: string }[] = [
  { id: "options", label: "Options · hedged" },
  { id: "futures", label: "Futures · hedged" },
];

const ATLAS_INTENTS: {
  id: AtlasView;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "options",
    icon: LineChart,
    title: "Build an option strategy",
    subtitle: "Hedged, defined-risk option structures from this symbol's data.",
  },
  {
    id: "futures",
    icon: Activity,
    title: "Build a futures strategy",
    subtitle: "A futures view paired with a protective option to cap risk.",
  },
  {
    id: "faq",
    icon: HelpCircle,
    title: "I have a different question",
    subtitle: "Learn how to read the zones, OI walls and IV — no strategy generated.",
  },
];

/** Static educational answers — NO AI call, so these cost nothing to serve. */
const ATLAS_FAQ: { q: string; a: string }[] = [
  {
    q: "What does \u201cmax pain\u201d mean?",
    a: "Max pain is the strike where the most options (calls + puts) would expire worthless \u2014 i.e. where option buyers collectively lose the most. It's often described as a mild magnet into expiry because option writers benefit if price drifts there. Treat it as a soft bias, never a target or a prediction.",
  },
  {
    q: "How do I read the OI walls?",
    a: "An open-interest (OI) wall is a strike with an unusually large number of open option contracts. A heavy put wall below price often behaves like a support floor; a heavy call wall above often behaves like a resistance cap. They show where positioning is concentrated \u2014 not where price must go.",
  },
  {
    q: "What is the IV regime telling me?",
    a: "Implied volatility (IV) regime describes whether options are currently cheap (calm) or expensive (elevated) versus normal. Calm IV favours buying / debit structures; elevated IV favours defined-risk premium-selling structures. It's a read on option pricing conditions, not a market call.",
  },
  {
    q: "Why does Atlas only show hedged ideas?",
    a: "Atlas is built for education and risk-awareness, not speculation. Every structure it lays out has defined or capped risk \u2014 a spread, or a futures leg paired with a protective option \u2014 so the worst case is always visible up front. It will never present a naked, unlimited-risk position.",
  },
  {
    q: "How are the risk / reward numbers calculated?",
    a: "The rupee figures are estimated from current at-the-money implied volatility using the Black-Scholes model, shown per share. Multiply by the lot size for the per-lot total. They describe the shape of the structure \u2014 they are estimates, not live tradeable quotes.",
  },
  {
    q: "Is this financial advice?",
    a: "No. Atlas is an educational research tool. It explains scenarios, structures and trade-offs grounded in the option data \u2014 it does not tell you to buy or sell, does not predict prices, and does not consider your personal circumstances. Always do your own research or consult a registered adviser.",
  },
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

const ATLAS_LABEL = "Atlas AI coach";

const CARD_STYLE = {
  backgroundColor: FNO_CARD_BG,
  border: "1px solid rgba(96,165,250,0.2)",
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
  const [view, setView] = useState<AtlasView>("menu");
  const [loadingMode, setLoadingMode] = useState<FynnMode | null>(null);
  const [byMode, setByMode] = useState<Record<FynnMode, ModeState>>({
    options: {},
    futures: {},
  });

  /** Slideshow: reset to the request menu when the active symbol changes. */
  useEffect(() => {
    setByMode({ options: {}, futures: {} });
    setLoadingMode(null);
    setView("menu");
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
            [target]: { error: json.error ?? "Atlas couldn't put together a plan right now." },
          }));
          return;
        }
        setByMode((prev) => ({ ...prev, [target]: { data: json } }));
      } catch {
        setByMode((prev) => ({
          ...prev,
          [target]: { error: "Network error reaching Atlas. Please try again." },
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
      // Land on the request menu — fetch nothing until the user explicitly asks.
      if (next) setView("menu");
    },
    [onOpenChange],
  );

  /** User picked an intent — only here do we (maybe) call the model. */
  const handleSelectIntent = useCallback(
    (intent: AtlasView) => {
      setView(intent);
      if (intent === "options" || intent === "futures") {
        if (!byMode[intent].data && loadingMode !== intent) void ask(intent);
      }
    },
    [ask, byMode, loadingMode],
  );

  const strategyMode: FynnMode | null =
    view === "options" || view === "futures" ? view : null;
  const current = strategyMode ? byMode[strategyMode] : undefined;
  const data = current?.data ?? null;
  const error = current?.error ?? null;
  const loading = strategyMode != null && loadingMode === strategyMode;
  const plan = data?.plan;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={`fynn-sparkle-btn${open ? " fynn-sparkle-btn-open" : ""} ${
          iconOnly
            ? "inline-flex items-center justify-center h-8 w-8 rounded-full transition-all hover:scale-[1.06] shrink-0"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] shrink-0"
        }`}
        style={{
          color: FNO_ACCENT,
          backgroundColor: "rgba(96,165,250,0.06)",
          border: "1px solid rgba(96,165,250,0.4)",
        }}
        aria-label={`${ATLAS_LABEL} — ${symbol}`}
        title={`${ATLAS_LABEL} — hedged strategy ideas for this symbol`}
      >
        <Sparkles
          className={`fynn-sparkle-glow ${iconOnly ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"}`}
          strokeWidth={2}
        />
        {!iconOnly ? <span className="whitespace-nowrap">{ATLAS_LABEL}</span> : null}
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
        <SheetContent
          side="right"
          overlayClassName="bg-black/15 pointer-events-none"
          className="fynn-ai-pane w-full sm:max-w-md overflow-y-auto border-l p-0 z-[210] !top-14 sm:!top-16 !bottom-0 !h-[calc(100dvh-3.5rem)] sm:!h-[calc(100dvh-4rem)] max-h-none"
        >
          <div className="relative p-5 sm:p-6 pr-12">
            <SheetHeader className="text-left space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                  style={{
                    color: "#bfdbfe",
                    background: "rgba(59,130,246,0.12)",
                    border: "1px solid rgba(96,165,250,0.4)",
                  }}
                >
                  <Sparkles className="h-3 w-3 fynn-coach-sparkle" />
                  {ATLAS_LABEL}
                </span>
              </div>
              <SheetTitle className="text-base" style={{ color: FNO_TEXT }}>
                {label || symbol}
              </SheetTitle>
              <SheetDescription style={{ color: FNO_MUTED }}>
                {view === "menu"
                  ? "What would you like Atlas to help you explore for this symbol?"
                  : view === "faq"
                    ? "Educational answers about the data — no strategy is generated here."
                    : "You asked Atlas to build this. It's an educational scenario, not advice."}
              </SheetDescription>
            </SheetHeader>

            {view !== "menu" ? (
              <button
                type="button"
                onClick={() => setView("menu")}
                className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: FNO_ACCENT }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to requests
              </button>
            ) : null}

            {view === "menu" ? (
              <div className="mt-4 space-y-2.5">
                {ATLAS_INTENTS.map(({ id, icon: Icon, title, subtitle }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectIntent(id)}
                    className="group flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all hover:scale-[1.01]"
                    style={{
                      backgroundColor: FNO_CARD_BG,
                      border: "1px solid rgba(96,165,250,0.22)",
                    }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: "rgba(59,130,246,0.14)",
                        border: "1px solid rgba(96,165,250,0.3)",
                      }}
                    >
                      <Icon className="h-4 w-4" style={{ color: FNO_ACCENT }} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold" style={{ color: FNO_TEXT }}>
                        {title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: FNO_MUTED }}>
                        {subtitle}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      style={{ color: FNO_MUTED }}
                    />
                  </button>
                ))}
                <p className="pt-1 text-[10px] leading-relaxed" style={{ color: FNO_MUTED }}>
                  Atlas only runs when you pick a request above. It&apos;s an educational research
                  assistant — not investment advice.
                </p>
              </div>
            ) : view === "faq" ? (
              <AtlasFaqView />
            ) : (
              <>
                <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Strategy mode">
                  {FYNN_MODES.map((m) => {
                    const active = m.id === strategyMode;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleSelectIntent(m.id)}
                        className="flex-1 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all"
                        style={{
                          color: active ? "#e0f2fe" : FNO_MUTED,
                          background: active ? "rgba(59,130,246,0.12)" : "transparent",
                          border: `1px solid ${active ? "rgba(96,165,250,0.45)" : "rgba(90,140,220,0.2)"}`,
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
                        border: "1px solid rgba(96,165,250,0.2)",
                        background: FNO_CARD_BG,
                      }}
                    >
                      <Loader2
                        className="h-7 w-7 animate-spin fynn-coach-sparkle"
                        style={{ color: FNO_ACCENT }}
                      />
                      <p className="text-xs">Atlas is reading the option data…</p>
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <ShieldAlert className="h-7 w-7" style={{ color: "#f87171" }} />
                      <p className="text-xs" style={{ color: "#fca5a5" }}>
                        {error}
                      </p>
                      <button
                        type="button"
                        onClick={() => strategyMode && void ask(strategyMode, true)}
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
                    <FynnPlanView
                      plan={plan}
                      onRefresh={() => strategyMode && void ask(strategyMode, true)}
                    />
                  ) : null}
                </div>

                {data?.disclaimer ? (
                  <p className="mt-6 text-[10px] leading-relaxed" style={{ color: FNO_MUTED }}>
                    {data.disclaimer}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function AtlasFaqView() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <div className="mt-4 space-y-2">
      {ATLAS_FAQ.map(({ q, a }, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={q}
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: FNO_CARD_BG, border: "1px solid rgba(96,165,250,0.2)" }}
          >
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-[13px] font-semibold" style={{ color: FNO_TEXT }}>
                {q}
              </span>
              {isOpen ? (
                <Minus className="h-3.5 w-3.5 shrink-0" style={{ color: FNO_ACCENT }} />
              ) : (
                <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: FNO_MUTED }} />
              )}
            </button>
            {isOpen ? (
              <p
                className="px-3.5 pb-3.5 -mt-0.5 text-[12px] leading-relaxed"
                style={{ color: "#cbd5e1" }}
              >
                {a}
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="pt-1 text-[10px] leading-relaxed" style={{ color: FNO_MUTED }}>
        These explainers are educational and do not constitute investment advice.
      </p>
    </div>
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
                  background: FNO_CARD_BG,
                  color: "#bfdbfe",
                  border: "1px solid rgba(96,165,250,0.25)",
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
