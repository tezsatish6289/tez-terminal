import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const metadata = {
  title: "About Us — FreedomBot.ai",
  description:
    "A team of 4 — developers, product managers, and chartists — who got tired of losing money and spent 18 months building the bot they wished existed.",
};

export default function AboutPage() {
  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}
    >
      {/* Nav */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.85)",
          borderColor: "rgba(90,140,220,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/freedombot/icon.png"
              alt="FreedomBot.ai"
              width={32}
              height={32}
              className="rounded-xl object-contain"
            />
            <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>
              FreedomBot.ai
            </span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm mb-12 transition-colors hover:text-blue-300 w-fit"
          style={{ color: "#64748b" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
          style={{
            backgroundColor: "rgba(37,99,235,0.1)",
            border: "1px solid rgba(96,165,250,0.2)",
            color: "#93c5fd",
          }}
        >
          Our Story
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter mb-6 leading-tight">
          We built this because{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
          >
            we were tired of losing money.
          </span>
        </h1>

        <p className="text-lg sm:text-xl leading-relaxed mb-16" style={{ color: "#94a3b8" }}>
          Not a hedge fund. Not a fintech startup with VC money. Just four people —
          developers, product managers, and chartists — who had enough of watching their
          portfolios bleed to emotions, bad timing, and strategies that looked great on paper
          but fell apart in live markets.
        </p>

        {/* Sections */}
        <div className="space-y-12">

          {/* Who we are */}
          <div
            className="rounded-2xl p-7 sm:p-10"
            style={{
              backgroundColor: "#0a1628",
              border: "1px solid rgba(90,140,220,0.15)",
            }}
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ color: "#e2e8f0" }}>
              Who we are
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#94a3b8" }}>
              We are a team of four — with a combined 30 years of experience across
              technology and financial markets. Between us we have built production software
              systems, managed trading positions, analysed charts, and shipped products that
              real users depend on. We are not theorists. We trade markets ourselves, we have
              felt the losses ourselves, and that is exactly why we built FreedomBot.
            </p>
            <p className="text-base leading-relaxed mt-4" style={{ color: "#94a3b8" }}>
              FreedomBot.ai is the product of{" "}
              <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Turbogains Fintech Solutions Private Limited</span>,
              a company incorporated in India in September 2025 (CIN: U62099UP2025PTC232196).
            </p>
          </div>

          {/* The journey */}
          <div
            className="rounded-2xl p-7 sm:p-10"
            style={{
              backgroundColor: "#0a1628",
              border: "1px solid rgba(90,140,220,0.15)",
            }}
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ color: "#e2e8f0" }}>
              18 months. Hundreds of algorithms. One bot.
            </h2>
            <p className="text-base leading-relaxed mb-5" style={{ color: "#94a3b8" }}>
              We started with a simple question: <em style={{ color: "#cbd5e1" }}>can a rule-based system outperform
              a human trader over the long run?</em> Over 18 months we built, tested, and
              discarded hundreds of algorithmic strategies across different market conditions —
              trending markets, ranging markets, high-volatility events, low-liquidity periods.
            </p>
            <p className="text-base leading-relaxed" style={{ color: "#94a3b8" }}>
              Most strategies failed. A few looked promising but broke down at the edges.
              The ones that survived shared a common trait: disciplined, unemotional risk
              management — not cleverness. The Crypto Bot you see today is the result of that
              entire process. It is not our first attempt. It is the one that earned the right
              to manage real capital.
            </p>
          </div>

          {/* Skin in the game */}
          <div
            className="rounded-2xl p-7 sm:p-10"
            style={{
              backgroundColor: "#0a1628",
              border: "1px solid rgba(96,165,250,0.25)",
            }}
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ color: "#e2e8f0" }}>
              We trade our own money on this bot.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#94a3b8" }}>
              Every member of the team has their own capital running on FreedomBot. We are
              not selling you a strategy we wouldn&apos;t trust with our own savings. When
              the bot loses, we lose too. When it wins, we win alongside you. That alignment
              is not a marketing line — it is the reason we obsess over every drawdown,
              every edge case, and every risk parameter. Your money is managed exactly the
              way we manage our own.
            </p>
          </div>

          {/* Transparency */}
          <div
            className="rounded-2xl p-7 sm:p-10"
            style={{
              backgroundColor: "#0a1628",
              border: "1px solid rgba(90,140,220,0.15)",
            }}
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ color: "#e2e8f0" }}>
              Why we publish our performance live — when almost no one else does.
            </h2>
            <p className="text-base leading-relaxed mb-5" style={{ color: "#94a3b8" }}>
              Most trading products show you curated screenshots, cherry-picked timeframes,
              or backtests that magically work. We chose a different path: every trade,
              every return, every drawdown — published live, pulled directly from our trading
              system, in real time.
            </p>
            <p className="text-base leading-relaxed" style={{ color: "#94a3b8" }}>
              This is not easy. Transparency means being accountable during losing streaks
              too, not just winning runs. But we believe that if a strategy cannot survive
              public scrutiny, it does not deserve your capital. The{" "}
              <Link
                href="/performance"
                className="font-semibold transition-colors hover:text-blue-300"
                style={{ color: "#60a5fa" }}
              >
                Performance page
              </Link>{" "}
              exists because we think you deserve the full picture before you deploy a
              single rupee.
            </p>
          </div>

          {/* Blockchain */}
          <div
            className="rounded-2xl p-7 sm:p-10"
            style={{
              backgroundColor: "#0a1628",
              border: "1px solid rgba(96,165,250,0.25)",
            }}
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ color: "#e2e8f0" }}>
              Every trade is on the blockchain.
            </h2>
            <p className="text-base leading-relaxed mb-5" style={{ color: "#94a3b8" }}>
              We don&apos;t just show you numbers on a dashboard — we write every closed
              trade permanently to the{" "}
              <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Solana blockchain</span>.
              Timestamped, immutable, and publicly verifiable by anyone. No edits.
              No deletions. No way to hide a bad trade.
            </p>
            <p className="text-base leading-relaxed mb-6" style={{ color: "#94a3b8" }}>
              This is the highest standard of transparency we know how to offer. You don&apos;t
              have to trust our dashboard — you can verify every single trade independently,
              forever.
            </p>
            <Link
              href="/records"
              className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:text-blue-300"
              style={{ color: "#60a5fa" }}
            >
              View on-chain trade records <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* What's next */}
          <div
            className="rounded-2xl p-7 sm:p-10"
            style={{
              backgroundColor: "#0a1628",
              border: "1px solid rgba(90,140,220,0.15)",
            }}
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ color: "#e2e8f0" }}>
              What&apos;s next
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#94a3b8" }}>
              The Crypto Bot is live and battle-tested. Next up: Indian Stock, Gold, and
              Silver bots — each built with the same 18-month rigour before they go anywhere
              near a production account. We are not in a rush to ship. We are in a rush to
              get it right.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-base mb-6" style={{ color: "#64748b" }}>
            Ready to see what 18 months of work looks like in practice?
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/performance"
              className="h-12 px-8 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 text-white"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              See Live Performance <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/"
              className="h-12 px-8 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all hover:scale-105"
              style={{
                border: "1px solid rgba(90,140,220,0.3)",
                color: "#93c5fd",
                backgroundColor: "rgba(37,99,235,0.08)",
              }}
            >
              Deploy Your Bot
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-10 mt-4" style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs" style={{ color: "#334155" }}>
            © 2026 FreedomBot.ai · Trading involves risk. Past performance does not guarantee future results.
          </p>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>Privacy</Link>
            <Link href="/terms" className="text-xs transition-colors hover:text-blue-300" style={{ color: "#475569" }}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
