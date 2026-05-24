/**
 * Plain-English copy and status tiers for performance metric insight cards.
 * Presentation only — values come from calcPerformanceMetrics().
 */

export type MetricStatus = "exceptional" | "strong" | "healthy" | "weak";

export interface MetricInsightDefinition {
  id: string;
  title: string;
  helperLabel: string;
  shortInterpretation: string;
  expandedExplanation: string;
  thinkOfIt: string;
  rangeGuide: string;
  comparisonLabel: string;
}

export const METRIC_COMPARISON_STRIP = [
  { metric: "Sharpe", measures: "Overall consistency" },
  { metric: "Sortino", measures: "Downside protection" },
  { metric: "Calmar", measures: "Return vs worst decline" },
  { metric: "Max DD", measures: "Worst peak-to-trough dip" },
] as const;

export const SHARPE_INSIGHT: MetricInsightDefinition = {
  id: "sharpe",
  title: "Sharpe Ratio",
  helperLabel: "Overall consistency",
  shortInterpretation:
    "Measures how consistently the strategy converts volatility into returns.",
  expandedExplanation:
    "A higher Sharpe Ratio means the portfolio generated stronger returns with smoother and more stable performance.",
  thinkOfIt: "How stable were the returns while growing capital?",
  rangeGuide: "Below 1 → volatile · 1–2 → solid · 2–3 → strong · 3+ → exceptional",
  comparisonLabel: "Overall consistency",
};

export const SORTINO_INSIGHT: MetricInsightDefinition = {
  id: "sortino",
  title: "Sortino Ratio",
  helperLabel: "Downside protection",
  shortInterpretation:
    "Measures return efficiency while minimizing harmful downside moves.",
  expandedExplanation:
    "Unlike Sharpe, Sortino focuses only on downside volatility and losing periods.",
  thinkOfIt: "How well does the strategy avoid painful losses while compounding?",
  rangeGuide: "Below 1 → weak control · 1–2 → good · 2–3 → strong · 3+ → exceptional",
  comparisonLabel: "Downside protection",
};

export const CALMAR_INSIGHT: MetricInsightDefinition = {
  id: "calmar",
  title: "Calmar Ratio",
  helperLabel: "Return vs drawdown",
  shortInterpretation:
    "Measures how much return was achieved relative to the worst drawdown.",
  expandedExplanation:
    "Calmar evaluates whether the growth was worth the drawdowns experienced along the way.",
  thinkOfIt: "Was the return worth the pain?",
  rangeGuide: "Below 1 → weak · 1–2 → acceptable · 2–5 → strong · 5+ → exceptional",
  comparisonLabel: "Return vs worst decline",
};

export const DRAWDOWN_INSIGHT: MetricInsightDefinition = {
  id: "drawdown",
  title: "Max Drawdown",
  helperLabel: "Worst decline",
  shortInterpretation:
    "The largest peak-to-trough drop in capital from closed trades.",
  expandedExplanation:
    "Shows the deepest loss from a prior high before recovering. Smaller drawdowns usually mean a smoother ride.",
  thinkOfIt: "What was the worst dip along the way?",
  rangeGuide: "Under 10% → mild · 10–20% → moderate · 20–30% → elevated · 30%+ → severe",
  comparisonLabel: "Worst peak-to-trough dip",
};

export function formatRatioValue(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(dp)}`;
}

/** Magnitude only — industry convention (always ≥ 0, no minus sign). */
export function formatDrawdownValue(pct: number): string {
  return `${Math.abs(pct).toFixed(2)}%`;
}

/** Sharpe & Sortino share the same tier boundaries. */
export function ratioStatusSharpeSortino(n: number): MetricStatus {
  if (!Number.isFinite(n) || n < 1) return "weak";
  if (n < 2) return "healthy";
  if (n < 3) return "strong";
  return "exceptional";
}

export function ratioStatusCalmar(n: number): MetricStatus {
  if (!Number.isFinite(n) || n < 1) return "weak";
  if (n < 2) return "healthy";
  if (n < 5) return "strong";
  return "exceptional";
}

/** Lower drawdown % is better (input is positive e.g. 18.5 for 18.5% DD). */
export function drawdownStatus(maxDrawdownPct: number): MetricStatus {
  if (maxDrawdownPct < 10) return "exceptional";
  if (maxDrawdownPct < 15) return "strong";
  if (maxDrawdownPct < 30) return "healthy";
  return "weak";
}

/** Y-axis bands drawn behind ratio history charts */
export interface RatioChartTier {
  y1: number;
  y2: number;
  status: MetricStatus;
  chartLabel: string;
}

export function ratioChartTiers(ratioId: "sharpe" | "sortino" | "calmar"): RatioChartTier[] {
  if (ratioId === "calmar") {
    return [
      { y1: -50, y2: 1, status: "weak", chartLabel: "Weak" },
      { y1: 1, y2: 2, status: "healthy", chartLabel: "Acceptable" },
      { y1: 2, y2: 5, status: "strong", chartLabel: "Strong" },
      { y1: 5, y2: 50, status: "exceptional", chartLabel: "Exceptional" },
    ];
  }
  return [
    { y1: -50, y2: 1, status: "weak", chartLabel: "Volatile" },
    { y1: 1, y2: 2, status: "healthy", chartLabel: "Solid" },
    { y1: 2, y2: 3, status: "strong", chartLabel: "Strong" },
    { y1: 3, y2: 50, status: "exceptional", chartLabel: "Exceptional" },
  ];
}

export function insightForRatio(ratioId: "sharpe" | "sortino" | "calmar"): MetricInsightDefinition {
  if (ratioId === "sortino") return SORTINO_INSIGHT;
  if (ratioId === "calmar") return CALMAR_INSIGHT;
  return SHARPE_INSIGHT;
}

export function statusForRatio(ratioId: "sharpe" | "sortino" | "calmar", n: number): MetricStatus {
  if (ratioId === "calmar") return ratioStatusCalmar(n);
  return ratioStatusSharpeSortino(n);
}

export function tierFillColor(status: MetricStatus): string {
  return STATUS_META[status].valueColor;
}

export function pillSolidBg(status: MetricStatus): string {
  if (status === "weak") return "#dc2626";
  if (status === "healthy") return "#ca8a04";
  return status === "exceptional" ? "#16a34a" : "#2563eb";
}

export const STATUS_META: Record<
  MetricStatus,
  { label: string; valueColor: string; badgeBg: string; badgeText: string; border: string; glow?: string }
> = {
  exceptional: {
    label: "Exceptional",
    valueColor: "#34d399",
    badgeBg: "rgba(16,185,129,0.15)",
    badgeText: "#6ee7b7",
    border: "rgba(16,185,129,0.25)",
    glow: "0 0 28px rgba(16,185,129,0.12)",
  },
  strong: {
    label: "Strong",
    valueColor: "#60a5fa",
    badgeBg: "rgba(96,165,250,0.15)",
    badgeText: "#93c5fd",
    border: "rgba(96,165,250,0.22)",
  },
  healthy: {
    label: "Healthy",
    valueColor: "#fbbf24",
    badgeBg: "rgba(251,191,36,0.12)",
    badgeText: "#fcd34d",
    border: "rgba(251,191,36,0.2)",
  },
  weak: {
    label: "Weak",
    valueColor: "#f87171",
    badgeBg: "rgba(248,113,113,0.12)",
    badgeText: "#fca5a5",
    border: "rgba(248,113,113,0.22)",
  },
};
