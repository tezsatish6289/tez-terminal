import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bot Performance & Equity Curve — FreedomBot.ai",
  description:
    "Track FreedomBot public bot performance: equity curve, monthly returns, win rate, drawdown, and risk metrics across supported strategies.",
  alternates: { canonical: "https://freedombot.ai/performance" },
  openGraph: {
    title: "Bot Performance — FreedomBot.ai",
    description:
      "Transparent performance stats for public FreedomBot strategies — returns, risk ratios, and capital curves.",
    url: "https://freedombot.ai/performance",
  },
};

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p className="sr-only">
        FreedomBot performance dashboard with equity curves, monthly and annualized returns, and risk
        metrics for publicly listed algorithmic crypto bots.
      </p>
      {children}
    </>
  );
}
