"use client";
import { cn } from "@/lib/utils";
import type { RatioKey } from "./RatioDrilldownChart";

const COPY: Record<
  RatioKey,
  {
    title: string;
    tagline: string;
    bullets: string[];
    interpret: string;
  }
> = {
  sharpe: {
    title: "What is Sharpe Ratio?",
    tagline: "Return earned per unit of total volatility.",
    bullets: [
      "Uses daily returns from closed trades, grouped by close date.",
      "Compares average daily return to a risk-free rate, divided by the standard deviation of daily returns.",
      "Annualised with √252 trading days — same formula as the headline tile.",
      "Tradewise: recomputed after each closed trade (all history so far). Daywise: snapshot at each active day.",
    ],
    interpret: "Higher is better. Above 1.0 is often considered solid risk-adjusted performance; below 0.5 suggests weak compensation for volatility.",
  },
  sortino: {
    title: "What is Sortino Ratio?",
    tagline: "Like Sharpe, but only penalises downside moves.",
    bullets: [
      "Same daily-return basis as Sharpe, but volatility is measured only on days below the risk-free rate.",
      "Upside swings do not inflate the denominator — useful when gains are lumpy (e.g. crypto).",
      "Annualised the same way (√252). Tradewise / daywise windows match the Sharpe charts.",
      "Crypto uses 0% risk-free; Indian stocks use ~6.5% RBI benchmark.",
    ],
    interpret: "Typically Sortino ≥ Sharpe when upside dominates. Values above 1.0 are strong; compare to Sharpe to see how much upside volatility is helping.",
  },
  calmar: {
    title: "What is Calmar Ratio?",
    tagline: "Annualised return divided by worst peak-to-trough drawdown.",
    bullets: [
      "Drawdown is measured on the closed-trade equity curve (fees included).",
      "Annualised return uses the same CAGR as the “Annualized Return” card — ratios cannot drift.",
      "Calmar = CAGR ÷ max drawdown (decimal). No drawdown with positive return → not plotted as ∞.",
      "Early track records can look extreme until drawdown stabilises — read alongside Max Drawdown.",
    ],
    interpret: "Higher means more return per unit of worst pain. There is no universal “good” line; context matters, but values above 1.0 are generally respectable.",
  },
};

interface RatioExplainPanelProps {
  ratioKey: RatioKey;
  className?: string;
  tradingDays?: number;
  riskFreeLabel: string;
}

export function RatioExplainPanel({
  ratioKey,
  className,
  tradingDays,
  riskFreeLabel,
}: RatioExplainPanelProps) {
  const c = COPY[ratioKey];

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.07] bg-white/[0.02] px-7 py-8 flex flex-col gap-7 h-full min-h-[340px] justify-center",
        className,
      )}
    >
      <div className="space-y-3">
        <h3 className="text-base font-black text-foreground tracking-tight leading-snug">
          {c.title}
        </h3>
        <p className="text-[13px] font-semibold text-accent/90 leading-relaxed">{c.tagline}</p>
      </div>
      <ul className="space-y-4">
        {c.bullets.map((b) => (
          <li
            key={b}
            className="text-[12px] text-muted-foreground/70 leading-[1.65] pl-4 border-l-2 border-white/[0.1]"
          >
            {b}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground/55 leading-[1.65] border-t border-white/[0.06] pt-6 mt-1">
        <span className="font-bold text-muted-foreground/80 block mb-2">How to read it</span>
        {c.interpret}
      </p>
      <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider pt-2">
        {tradingDays != null ? `${tradingDays} active trading days · ` : ""}
        {riskFreeLabel}
      </p>
    </div>
  );
}
