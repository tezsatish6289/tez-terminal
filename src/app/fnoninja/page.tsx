import Image from "next/image";
import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FnoNinjaFooter } from "@/components/fnoninja/FnoNinjaFooter";
import { FnoNinjaHero } from "@/components/fnoninja/FnoNinjaHero";
import { FnoNinjaFeaturesSection } from "@/components/fnoninja/FnoNinjaFeaturesSection";
import { FnoNinjaHowItWorksSection } from "@/components/fnoninja/FnoNinjaHowItWorksSection";
import { FnoNinjaProblemSection } from "@/components/fnoninja/FnoNinjaProblemSection";
import {
  Database,
  Eye,
  LineChart,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  FB_CONTENT_SHELL,
  FB_MEDIUM_SHELL,
  FB_NARROW_SHELL,
} from "@/lib/freedombot/responsive";
import {
  FNO_ACCENT,
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

      <FnoNinjaProblemSection />

      <FnoNinjaHowItWorksSection />

      <FnoNinjaFeaturesSection />

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
            <FnoNinjaCtaLink>Explore live market map</FnoNinjaCtaLink>
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
            FNONINJA is a market analytics and data visualization platform. Information displayed is
            generated through automated processing of publicly available market data and is provided
            solely for{" "}
            <strong className="font-semibold" style={{ color: "#cbd5e1" }}>
              informational and educational purposes
            </strong>
            .
          </p>
          <p className="mt-3">
            FNONINJA does not provide investment advice, investment recommendations, research
            recommendations, stock recommendations, trading calls, buy/sell suggestions, portfolio
            management services, order execution, or personalized financial advice. FNONINJA is not
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
            FNONINJA is not affiliated with, endorsed by, or sponsored by NSE, BSE, or any exchange
            or broker.
          </p>
        </div>
      </section>

      <FnoNinjaFooter />
    </div>
  );
}
