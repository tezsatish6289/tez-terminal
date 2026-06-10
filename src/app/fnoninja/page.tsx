import Image from "next/image";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FnoNinjaFooter } from "@/components/fnoninja/FnoNinjaFooter";
import { FnoNinjaHero } from "@/components/fnoninja/FnoNinjaHero";
import {
  BarChart3,
  Clock,
  Database,
  Eye,
  Grid3X3,
  Layers,
  LineChart,
  Presentation,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  FB_CONTENT_SHELL,
  FB_DOC_SHELL,
  FB_MEDIUM_SHELL,
  FB_NARROW_SHELL,
} from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
  FNO_ACCENT_SOFT,
  FNO_CARD_BG,
  FNO_CARD_BORDER,
  FNO_MUTED,
  FNO_NAV_BORDER,
} from "@/lib/fnoninja/theme";

const cardStyle = {
  backgroundColor: FNO_CARD_BG,
  border: FNO_CARD_BORDER,
};

export default function FnoNinjaLandingPage() {
  return (
    <div className="font-sans antialiased min-w-0 flex flex-col flex-1">
      <FnoNinjaHero />

      {/* Problem */}
      <section className={`${FB_DOC_SHELL} py-16 sm:py-24`}>
        <div className="text-center mb-10">
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-4"
            style={{ color: "#334155" }}
          >
            The challenge
          </p>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight max-w-3xl mx-auto">
            The option chain contains useful market information. Tracking it across hundreds of
            symbols is difficult.
          </h2>
        </div>
        <p
          className="text-base sm:text-lg leading-relaxed max-w-3xl mx-auto text-center"
          style={{ color: FNO_MUTED }}
        >
          FNONinja aggregates publicly available option-chain data across NSE F&amp;O stocks and
          indices and presents it through visual market maps, zone views, and symbol-level
          analytics. Instead of manually reviewing individual option chains, you can monitor
          broader market structure from a single interface — for your own independent research.
        </p>
      </section>

      {/* What is */}
      <section className={`${FB_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <div className="rounded-2xl p-6 sm:p-8" style={cardStyle}>
          <h2 className="text-xl sm:text-2xl font-black text-white">What is FNONinja</h2>
          <p className="mt-4 leading-relaxed" style={{ color: FNO_MUTED }}>
            FNONinja is an options-market{" "}
            <strong className="font-semibold" style={{ color: "#cbd5e1" }}>
              analytics and data visualization
            </strong>{" "}
            platform for Indian markets. The platform processes publicly available option-chain
            information and presents{" "}
            <strong className="font-semibold" style={{ color: "#cbd5e1" }}>
              observed
            </strong>{" "}
            support zones, resistance zones, open-interest concentrations, and related
            market-structure metrics through interactive visualizations.
          </p>
          <p className="mt-4 leading-relaxed" style={{ color: FNO_MUTED }}>
            Explore symbols individually or monitor the broader market using maps, filters, and
            symbol-level views. Outputs are shown for user interpretation — not as recommendations.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className={`${FB_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <div className="text-center mb-10">
          <p
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5"
            style={{
              backgroundColor: FNO_ACCENT_SOFT,
              border: "1px solid rgba(90,140,220,0.2)",
              color: FNO_ACCENT,
            }}
          >
            How it works
          </p>
        </div>
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
            <div key={step} className="rounded-2xl p-6 sm:p-8" style={cardStyle}>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black"
                  style={{
                    backgroundColor: FNO_ACCENT_SOFT,
                    color: FNO_ACCENT,
                  }}
                >
                  {step}
                </span>
                <Icon className="h-4 w-4" style={{ color: "#475569" }} />
              </div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: FNO_MUTED }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className={`${FB_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Features</h2>
          <p className="mt-3 text-sm" style={{ color: FNO_MUTED }}>
            Research tools for exploring option-derived market structure
          </p>
        </div>
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
            <div key={title} className="rounded-2xl p-6 sm:p-8 flex gap-4" style={cardStyle}>
              <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: FNO_ACCENT }} />
              <div>
                <h3 className="text-sm font-bold text-white">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: FNO_MUTED }}>
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className={`${FB_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <h2
          className="text-xs font-bold uppercase tracking-widest mb-8 text-center"
          style={{ color: "#334155" }}
        >
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
            <div key={title} className="rounded-2xl p-6 sm:p-8" style={cardStyle}>
              <Icon className="h-4 w-4 mb-3" style={{ color: "#475569" }} />
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: FNO_MUTED }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Approach */}
      <section className={`${FB_CONTENT_SHELL} pb-14 sm:pb-20`}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Data first", body: "Analytics and visualization — not trade calls or suggestions." },
            { title: "Visible outputs", body: "Derived zones and metrics are shown on-screen for your interpretation." },
            { title: "Broad coverage", body: "Major NSE indices and the F&O stock universe." },
            { title: "Research tools", body: "Maps and dashboards designed for efficient exploration." },
          ].map(({ title, body }) => (
            <div key={title} className="rounded-2xl p-6" style={cardStyle}>
              <h3 className="text-sm font-bold" style={{ color: FNO_ACCENT }}>
                {title}
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: FNO_MUTED }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-16 sm:py-24" style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}>
        <div className={`${FB_NARROW_SHELL} text-center`}>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Explore option-chain-derived market structure{" "}
            <span style={{ color: FNO_ACCENT }}>across NSE F&amp;O</span>
          </h2>
          <p className="mt-4 max-w-lg mx-auto leading-relaxed" style={{ color: FNO_MUTED }}>
            Monitor observed support and resistance observations, open-interest concentrations, and
            price positioning through a unified analytics experience.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <FnoNinjaCtaLink>See market map</FnoNinjaCtaLink>
          </div>
        </div>
      </section>

      {/* Powered by */}
      <section className="py-12 px-4 sm:px-6" style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}>
        <div className={`${FB_MEDIUM_SHELL} text-center`}>
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-8"
            style={{ color: "#1e293b" }}
          >
            Powered by
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <a
              href="https://freedombot.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold opacity-50 hover:opacity-80 transition-opacity"
              style={{ color: "#94a3b8" }}
            >
              FreedomBot.ai
            </a>
            <div className="flex items-center gap-2 opacity-50">
              <div className="h-6 w-6 rounded-md bg-white flex items-center justify-center overflow-hidden p-0.5 flex-shrink-0">
                <Image
                  src="/freedombot/firebase.png"
                  alt="Firebase"
                  width={20}
                  height={20}
                  className="object-contain"
                />
              </div>
              <span className="text-sm font-bold" style={{ color: "#94a3b8" }}>
                Firebase
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section id="disclaimer" className={`${FB_NARROW_SHELL} py-14 sm:py-16`}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4" style={{ color: FNO_ACCENT }} />
          <h2
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "#334155" }}
          >
            Important disclaimer
          </h2>
        </div>
        <div
          className="rounded-2xl p-5 sm:p-6 text-[12px] sm:text-[13px] leading-relaxed"
          style={{
            backgroundColor: FNO_CARD_BG,
            border: "1px solid rgba(90,140,220,0.15)",
            color: FNO_MUTED,
          }}
        >
          <p>
            FNONinja is a market analytics and data visualization platform. Information displayed is
            generated through automated processing of publicly available market data and is provided
            solely for{" "}
            <strong className="font-semibold" style={{ color: "#cbd5e1" }}>
              informational and educational purposes
            </strong>
            .
          </p>
          <p className="mt-3">
            FNONinja does not provide investment advice, investment recommendations, research
            recommendations, stock recommendations, trading calls, buy/sell suggestions, portfolio
            management services, order execution, or personalized financial advice. FNONinja is not
            registered with the Securities and Exchange Board of India (SEBI) as a Research Analyst
            or Investment Adviser.
          </p>
          <p className="mt-3">
            Market data and derived metrics may be delayed, incomplete, or inaccurate. Past
            observations do not indicate future price movement. Derivatives trading involves
            substantial risk of loss.
          </p>
          <p className="mt-3">
            Users must conduct their own independent analysis and consult qualified financial
            professionals before making investment decisions. All investment and trading decisions
            are solely the responsibility of the user.
          </p>
          <p className="mt-3">
            FNONinja is not affiliated with, endorsed by, or sponsored by NSE, BSE, or any exchange
            or broker.
          </p>
        </div>
      </section>

      <FnoNinjaFooter />
    </div>
  );
}
