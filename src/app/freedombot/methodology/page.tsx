import type { Metadata } from "next";
import Link from "next/link";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  Lock,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Rocket,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works — FreedomBot.ai",
  description:
    "Every trade follows a strict, rule-based playbook. Stop losses, position sizing, leverage rules, and market intelligence — fully documented.",
  alternates: { canonical: "https://freedombot.ai/methodology" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="h-px flex-1" style={{ backgroundColor: "rgba(148,163,184,0.08)" }} />
      <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "#64748b" }}>
        {children}
      </span>
      <span className="h-px flex-1" style={{ backgroundColor: "rgba(148,163,184,0.08)" }} />
    </div>
  );
}

function MethodCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-7 sm:p-8"
      style={{ backgroundColor: "#0d1a2e", border: "1px solid rgba(148,163,184,0.08)" }}
    >
      <div className="flex items-start gap-4 mb-5">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)" }}
        >
          <Icon className="h-5 w-5" style={{ color: "#60a5fa" }} />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-white leading-snug">{title}</h3>
      </div>
      <div className="space-y-3.5 text-sm sm:text-[15px] leading-relaxed" style={{ color: "#94a3b8" }}>
        {children}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-[7px] h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: "#60a5fa", opacity: 0.6 }}
      />
      <span>{children}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MethodologyPage() {
  return (
    <div
      className="min-h-screen font-sans antialiased overflow-x-hidden"
      style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}
    >
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-14">

        {/* ── Hero ── */}
        <div className="text-center py-6 sm:py-10 space-y-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
            style={{
              backgroundColor: "rgba(96,165,250,0.1)",
              border: "1px solid rgba(96,165,250,0.2)",
              color: "#60a5fa",
            }}
          >
            <BarChart3 className="h-3 w-3" />
            Methodology
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter">
            How it{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
            >
              works
            </span>
          </h1>

          <p
            className="text-sm sm:text-base max-w-xl mx-auto leading-relaxed"
            style={{ color: "#64748b" }}
          >
            Every trade follows a strict, rule-based playbook. No improvisation. No emotions.
            Entry rules, stop-loss logic, position sizing — fully documented.
          </p>

          <Link
            href="/performance"
            className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-blue-300 mt-1"
            style={{ color: "#60a5fa" }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            View live performance data →
          </Link>
        </div>

        {/* ══ Trade Execution ══ */}
        <div>
          <SectionLabel>Trade Execution</SectionLabel>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6">
            <MethodCard icon={Target} title="Stop Loss — Capital Protection First">
              <Bullet>
                Every position has a Stop Loss set{" "}
                <strong className="text-white">at the moment of entry</strong> — no exceptions.
              </Bullet>
              <Bullet>
                SL is placed at a technically significant level, not an arbitrary percentage, so it
                reflects genuine market structure.
              </Bullet>
              <Bullet>
                If SL is triggered, the position is fully closed and capital is preserved for the
                next opportunity.
              </Bullet>
            </MethodCard>

            <MethodCard icon={TrendingUp} title="Trailing Stop Loss — Lock In Gains">
              <Bullet>
                Once a trade moves in our favour past a defined threshold, the SL automatically{" "}
                <strong className="text-white">trails the price</strong>.
              </Bullet>
              <Bullet>
                This locks in profit progressively — you can never give back more than a small
                portion of an open gain.
              </Bullet>
              <Bullet>
                Trailing is based on market structure, not a fixed trailing distance, so it adapts
                to volatility.
              </Bullet>
            </MethodCard>

            <MethodCard icon={Zap} title="TP1 — Lock In & De-Risk">
              <Bullet>
                When price hits <strong className="text-white">TP1</strong>, we close{" "}
                <strong className="text-white">20% of the position</strong> — securing a small,
                guaranteed profit immediately.
              </Bullet>
              <Bullet>
                The SL is then moved to the{" "}
                <strong className="text-white">cost price (breakeven)</strong> — the trade can no
                longer result in a loss, no matter what happens next.
              </Bullet>
              <Bullet>
                The remaining <strong className="text-white">80%</strong> continues to run with zero
                downside risk.
              </Bullet>
            </MethodCard>

            <MethodCard icon={CheckCircle2} title="TP2, TP3 & Trailing SL — Let Winners Run">
              <Bullet>
                TP2 and TP3 are{" "}
                <strong className="text-white">reference levels</strong>, not partial exits — when
                price reaches them, we know momentum is strong and tighten the trailing SL.
              </Bullet>
              <Bullet>
                The trailing SL{" "}
                <strong className="text-white">follows the price upward</strong>, locking in more
                profit with every move in our favour.
              </Bullet>
              <Bullet>
                The remaining 80% is closed when the trailing SL is eventually triggered —
                capturing as much of the move as possible.
              </Bullet>
            </MethodCard>
          </div>
        </div>

        {/* ══ Risk Management ══ */}
        <div>
          <SectionLabel>Risk Management</SectionLabel>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6">
            <MethodCard icon={Shield} title="Position Sizing — Never Risk the House">
              <Bullet>
                You choose <strong className="text-white">risk per trade</strong> in Bot Settings
                (default <strong className="text-white">1%</strong>, range 0.25%–1% of your
                balance). Each new position uses that slice of capital, with a stop-loss set at
                entry.
              </Bullet>
              <Bullet>
                <strong className="text-white">Max open</strong> limits how many positions can run at
                once on your exchange.{" "}
                <strong className="text-white">Daily loss cap</strong> (default{" "}
                <strong className="text-white">3%</strong>) pauses new trades if today&apos;s
                losses reach your limit — protecting you from a bad day.
              </Bullet>
              <Bullet>
                Sizing uses a percentage of your <strong className="text-white">current balance</strong>{" "}
                (not a fixed dollar), so position sizes shrink when capital dips and grow when it
                rises. Only funds free to trade are used — not money already locked in open
                positions.
              </Bullet>
              <Bullet>
                At the default 1% risk, it would take roughly{" "}
                <strong className="text-white">460 consecutive losses</strong> to approach zero — a
                scenario that has never come close to occurring. Past recovery is not a promise of
                future results.
              </Bullet>
            </MethodCard>

            <MethodCard icon={Lock} title="Leverage — Controlled, Not Reckless">
              <Bullet>
                We use leverage to amplify{" "}
                <strong className="text-white">signal efficiency</strong>, not to chase bigger bets.
              </Bullet>
              <Bullet>
                Leverage is capped at <strong className="text-white">10×</strong>. With small,
                user-set risk per trade (default 1%), a stop-loss hit represents a{" "}
                <strong className="text-white">small, defined loss</strong> — not a wipeout.
              </Bullet>
              <Bullet>
                The distance from entry to stop loss is always wider than the liquidation price —{" "}
                <strong className="text-white">
                  liquidation cannot happen on a normal SL-triggering move
                </strong>
                .
              </Bullet>
            </MethodCard>

            <MethodCard icon={AlertTriangle} title="Funding Rate Awareness">
              <Bullet>
                In perpetual futures, open positions pay or receive{" "}
                <strong className="text-white">funding every 8 hours</strong>.
              </Bullet>
              <Bullet>
                We monitor funding rates in real time. When funding becomes extreme, it signals an
                overcrowded trade — a potential reversal.
              </Bullet>
              <Bullet>
                High funding on a long = we avoid adding. Extremely negative funding = we look for
                long entries, not shorts.
              </Bullet>
            </MethodCard>

            <MethodCard icon={TrendingDown} title="Liquidation Protection">
              <Bullet>
                Our position sizing ensures the SL is always triggered{" "}
                <strong className="text-white">long before</strong> the liquidation price is
                reached.
              </Bullet>
              <Bullet>
                We use <strong className="text-white">isolated margin</strong> on every trade — the
                bot sets this automatically before placing any order. Your full account balance is
                never at risk from a single position.
              </Bullet>
              <Bullet>
                In the event of a flash crash, the position closes at the next available price —
                but liquidation risk is{" "}
                <strong className="text-white">structurally eliminated by design</strong>.
              </Bullet>
            </MethodCard>
          </div>
        </div>

        {/* ══ Market Intelligence ══ */}
        <div>
          <SectionLabel>Market Intelligence</SectionLabel>
          <div className="grid sm:grid-cols-3 gap-5 sm:gap-6">
            <MethodCard icon={BarChart3} title="Order Blocks">
              <Bullet>
                Order blocks are zones where large institutional orders were previously filled,
                leaving a footprint in price action.
              </Bullet>
              <Bullet>
                Price often returns to these zones to retest them. We use order blocks to identify{" "}
                <strong className="text-white">high-probability entry zones</strong>.
              </Bullet>
              <Bullet>
                Entering at an order block means a tighter SL — better risk-reward on every trade.
              </Bullet>
            </MethodCard>

            <MethodCard icon={Zap} title="Liquidation Heatmaps">
              <Bullet>
                Exchanges track where leveraged positions will be force-closed, creating{" "}
                <strong className="text-white">liquidity clusters</strong> at predictable price
                levels.
              </Bullet>
              <Bullet>
                Large players push price into these zones to trigger liquidations and fill their
                own orders.
              </Bullet>
              <Bullet>
                We map these zones in advance, avoiding obvious liquidation cluster stops.
              </Bullet>
            </MethodCard>

            <MethodCard icon={TrendingUp} title="Funding Rate Signals">
              <Bullet>
                Funding rate is a real-time measure of sentiment. Extreme funding = the crowd is
                likely wrong.
              </Bullet>
              <Bullet>
                We use extreme funding readings as a{" "}
                <strong className="text-white">contrarian filter</strong> — avoiding trades that
                align with an overly crowded side.
              </Bullet>
              <Bullet>
                Normal or negative funding supports long bias. Extreme positive funding signals
                caution.
              </Bullet>
            </MethodCard>
          </div>
        </div>

        {/* ══ What we don't publish ══ */}
        <div
          className="rounded-2xl p-7 sm:p-9"
          style={{
            backgroundColor: "rgba(96,165,250,0.04)",
            border: "1px solid rgba(96,165,250,0.1)",
          }}
        >
          <h3 className="text-base sm:text-lg font-bold text-white mb-3">
            What we don&apos;t publish
          </h3>
          <p
            className="text-sm sm:text-[15px] leading-relaxed"
            style={{ color: "#94a3b8" }}
          >
            The specific signal logic — which indicators, which thresholds, which combinations
            trigger an entry — is our core IP. Publishing it would let anyone replicate (and
            front-run) the strategy, degrading performance for all users. What you see above is{" "}
            <strong className="text-white">everything that matters to you as a capital allocator</strong>:
            how risk is managed, what the real numbers look like, and exactly what the system does
            when things go right or wrong.
          </p>
        </div>

        {/* ══ CTA ══ */}
        <div className="text-center pb-10">
          <p className="text-base mb-6" style={{ color: "#94a3b8" }}>
            Ready to let FreedomBot trade for you?
          </p>
          <Link
            href="/?deploy=1"
            className="inline-flex items-center gap-2.5 h-14 px-10 rounded-2xl font-bold text-base text-white transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              boxShadow: "0 8px 30px rgba(59,130,246,0.35)",
            }}
          >
            <Rocket className="h-5 w-5" />
            Deploy Your Bot
          </Link>
          <p className="text-sm mt-4" style={{ color: "#64748b" }}>
            Takes less than 5 minutes · No withdrawal access required · Free to start
          </p>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/freedombot/icon.png"
              alt="FreedomBot.ai"
              width={24}
              height={24}
              className="rounded-lg object-contain"
            />
            <span className="text-xs font-bold" style={{ color: "#334155" }}>
              freedombot.ai
            </span>
          </Link>
          <p className="text-[11px]" style={{ color: "#1e3a5f" }}>
            &copy; {new Date().getFullYear()} FreedomBot.ai · Trading involves risk. Past
            performance does not guarantee future results.
          </p>
        </div>
      </footer>
    </div>
  );
}
