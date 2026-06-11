import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

const STEPS = [
  {
    step: "01",
    title: "Live Data Collection",
    body: "We continuously fetch and process real-time option chain data for all NSE F&O stocks and key indices during market hours.",
  },
  {
    step: "02",
    title: "Smart Analysis",
    body: "Our algorithms identify high-conviction open interest clusters and automatically derive key support and resistance zones — clearly labelled as observations, never as trading signals.",
  },
  {
    step: "03",
    title: "Interactive Visualization",
    body: "The insights are brought to life through intuitive market maps, symbol dashboards, and clean charts — giving you a powerful visual edge for your own research and decision-making.",
  },
] as const;

const cardStyle = {
  backgroundColor: "#131a28",
  border: "1px solid rgba(90,140,220,0.12)",
};

export function FnoNinjaHowItWorksSection() {
  return (
    <section id="how-it-works" className={`${FB_CONTENT_SHELL} py-16 sm:py-20 lg:py-24`}>
      <div className="mb-10 sm:mb-12">
        <p
          className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
          style={{ color: FNO_ACCENT }}
        >
          3-Step Process
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          How FNO Ninja Works
        </h2>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 lg:gap-5">
        {STEPS.map(({ step, title, body }) => (
          <div key={step} className="rounded-2xl p-6 sm:p-8 lg:p-9" style={cardStyle}>
            <p
              className="text-sm font-bold font-mono tracking-wide mb-5"
              style={{ color: FNO_ACCENT }}
            >
              {step}
            </p>
            <h3 className="text-base sm:text-lg font-bold text-white leading-snug">{title}</h3>
            <p className="mt-3 text-[13px] sm:text-sm leading-relaxed" style={{ color: FNO_MUTED }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
