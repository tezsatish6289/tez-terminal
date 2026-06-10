import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import {
  BarChart3,
  Clock,
  Database,
  Eye,
  Grid3X3,
  Layers,
  LineChart,
  Presentation,
  Users,
} from "lucide-react";
import { FNO_CONTENT_SHELL, FNO_NARROW_SHELL } from "@/lib/fnoninja/responsive";

const CARD =
  "rounded-2xl p-6 sm:p-8 border border-white/[0.08] bg-white/[0.02]";

export default function FnoNinjaLandingPage() {
  return (
    <div className="pb-16">
      {/* Hero */}
      <section
        className="relative border-b border-white/[0.06] overflow-hidden"
        style={{
          background: `
            radial-gradient(ellipse 70% 55% at 50% 0%, rgba(16,185,129,0.1), transparent),
            radial-gradient(ellipse 50% 40% at 80% 20%, rgba(6,182,212,0.06), transparent),
            #060912
          `,
        }}
      >
        <div className={`${FNO_NARROW_SHELL} py-16 sm:py-24 text-center`}>
          <p
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-6"
            style={{
              backgroundColor: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(52,211,153,0.25)",
              color: "#6ee7b7",
            }}
          >
            NSE F&O · Data visualization
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.1]">
            FNONinja — Option-chain analytics for NSE F&amp;O
          </h1>
          <p className="mt-6 text-base sm:text-lg leading-relaxed text-slate-400 max-w-2xl mx-auto">
            View option-interest concentrations, derived support and resistance{" "}
            <span className="text-slate-300">observations</span>, and price positioning
            across NSE F&amp;O stocks and indices in one data visualization interface.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <FnoNinjaCtaLink>Explore analytics</FnoNinjaCtaLink>
          </div>
          <p className="mt-6 text-[11px] text-slate-500 max-w-xl mx-auto leading-relaxed">
            Market data visualization · Algorithmically derived observations · Informational
            only · Not investment advice
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className={`${FNO_NARROW_SHELL} py-14 sm:py-20`}>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          The option chain contains useful market information. Tracking it across hundreds
          of symbols is difficult.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-400 leading-relaxed">
          FNONinja aggregates publicly available option-chain data across NSE F&amp;O stocks
          and indices and presents it through visual market maps, zone views, and
          symbol-level analytics. Instead of manually reviewing individual option chains,
          you can monitor broader market structure from a single interface — for your own
          independent research.
        </p>
      </section>

      {/* What is */}
      <section className={`${FNO_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <div className={CARD}>
          <h2 className="text-xl sm:text-2xl font-bold text-white">What is FNONinja</h2>
          <p className="mt-4 text-slate-400 leading-relaxed">
            FNONinja is an options-market <strong className="text-slate-300 font-semibold">analytics and data visualization</strong> platform for Indian markets. The platform processes publicly available option-chain information and presents{" "}
            <strong className="text-slate-300 font-semibold">observed</strong> support zones,
            resistance zones, open-interest concentrations, and related market-structure
            metrics through interactive visualizations.
          </p>
          <p className="mt-4 text-slate-400 leading-relaxed">
            Explore symbols individually or monitor the broader market using maps, filters,
            and symbol-level views. Outputs are shown for user interpretation — not as
            recommendations.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className={`${FNO_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">
          How it works
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              step: "1",
              title: "Collect market data",
              body: "Option-chain information is collected and processed for NSE F&O stocks and major indices during trading hours.",
              icon: Database,
            },
            {
              step: "2",
              title: "Derive analytical observations",
              body: "Algorithms highlight areas where open interest is concentrated and display them as derived support and resistance observations — not recommendations.",
              icon: Layers,
            },
            {
              step: "3",
              title: "Visualize market structure",
              body: "Results appear on market maps, symbol dashboards, and charts to support your own research process.",
              icon: Grid3X3,
            },
          ].map(({ step, title, body, icon: Icon }) => (
            <div key={step} className={CARD}>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-emerald-300"
                  style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
                >
                  {step}
                </span>
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="mt-2 text-[13px] text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className={`${FNO_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">
          Features
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              icon: Grid3X3,
              title: "Market map",
              body: "Visualize option-derived market structure across the NSE F&O universe in one interactive view.",
            },
            {
              icon: BarChart3,
              title: "Symbol analytics",
              body: "Review derived support and resistance observations, open-interest context, and related metrics per symbol.",
            },
            {
              icon: LineChart,
              title: "Zone dashboard",
              body: "See how current prices relate to option-derived zone observations — for user interpretation only.",
            },
            {
              icon: Clock,
              title: "Scheduled data refresh",
              body: "Data is refreshed during trading hours. Each symbol displays a last-updated timestamp.",
            },
            {
              icon: Presentation,
              title: "Slideshow mode",
              body: "Review multiple symbols through a structured analytics interface with charts and zone views.",
            },
            {
              icon: Eye,
              title: "Display filters",
              body: "Narrow the universe by zone position. Filters organize data — they do not constitute advice.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className={`${CARD} flex gap-4`}>
              <Icon className="h-5 w-5 text-emerald-400/80 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-white">{title}</h3>
                <p className="mt-1.5 text-[13px] text-slate-400 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className={`${FNO_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">
          Who it&apos;s for
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              icon: Users,
              title: "Market participants",
              body: "Monitor option-chain-derived analytics across multiple symbols. Not a substitute for professional advice.",
            },
            {
              icon: Database,
              title: "Researchers",
              body: "Study open-interest concentrations and price positioning in a structured format.",
            },
            {
              icon: LineChart,
              title: "Active market users",
              body: "Use option-market context as one input among many in independent decision-making.",
            },
            {
              icon: Eye,
              title: "Market enthusiasts",
              body: "Explore how options-market positioning evolves throughout the trading session.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className={CARD}>
              <Icon className="h-4 w-4 text-slate-500 mb-3" />
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="mt-2 text-[13px] text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Differentiation */}
      <section className={`${FNO_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">
          Approach
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Data first", body: "Analytics and visualization — not trade calls or suggestions." },
            { title: "Visible outputs", body: "Derived zones and metrics are shown on-screen for your interpretation." },
            { title: "Broad coverage", body: "Major NSE indices and the F&O stock universe." },
            { title: "Research tools", body: "Maps and dashboards designed for efficient exploration." },
          ].map(({ title, body }) => (
            <div key={title} className={CARD}>
              <h3 className="text-sm font-bold text-emerald-300/90">{title}</h3>
              <p className="mt-2 text-[12px] text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section
        className="border-y border-white/[0.06]"
        style={{ backgroundColor: "rgba(16,185,129,0.04)" }}
      >
        <div className={`${FNO_NARROW_SHELL} py-14 sm:py-20 text-center`}>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Explore option-chain-derived market structure across NSE F&amp;O
          </h2>
          <p className="mt-4 text-slate-400 max-w-lg mx-auto leading-relaxed">
            Monitor observed support and resistance observations, open-interest
            concentrations, and price positioning through a unified analytics experience.
          </p>
          <div className="mt-8 flex justify-center">
            <FnoNinjaCtaLink>Open analytics dashboard</FnoNinjaCtaLink>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section id="disclaimer" className={`${FNO_NARROW_SHELL} py-14 sm:py-16`}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
          Important disclaimer
        </h2>
        <div
          className="rounded-xl p-5 sm:p-6 text-[12px] sm:text-[13px] leading-relaxed text-slate-400 border border-amber-500/20"
          style={{ backgroundColor: "rgba(120, 53, 15, 0.08)" }}
        >
          <p>
            FNONinja is a market analytics and data visualization platform. Information
            displayed is generated through automated processing of publicly available market
            data and is provided solely for{" "}
            <strong className="text-slate-300">informational and educational purposes</strong>.
          </p>
          <p className="mt-3">
            FNONinja does not provide investment advice, investment recommendations, research
            recommendations, stock recommendations, trading calls, buy/sell suggestions,
            portfolio management services, order execution, or personalized financial advice.
            FNONinja is not registered with the Securities and Exchange Board of India (SEBI)
            as a Research Analyst or Investment Adviser.
          </p>
          <p className="mt-3">
            Market data and derived metrics may be delayed, incomplete, or inaccurate. Past
            observations do not indicate future price movement. Derivatives trading involves
            substantial risk of loss.
          </p>
          <p className="mt-3">
            Users must conduct their own independent analysis and consult qualified financial
            professionals before making investment decisions. All investment and trading
            decisions are solely the responsibility of the user.
          </p>
          <p className="mt-3">
            FNONinja is not affiliated with, endorsed by, or sponsored by NSE, BSE, or any
            exchange or broker.
          </p>
        </div>
        <p className="mt-8 text-center text-[11px] text-slate-600">
          © {new Date().getFullYear()} FNONinja · For informational purposes only
        </p>
      </section>
    </div>
  );
}
