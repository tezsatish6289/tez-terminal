import { FB_CONTENT_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

const STEPS = [
  {
    step: "01",
    title: "Scan Everything",
    body: "We process real-time option chain data for 200+ NSE F&O stocks and major indices in real time.",
  },
  {
    step: "02",
    title: "Highlight What Matters",
    body: "Our system identifies stocks at strong Put Clusters (Support) and Call Clusters (Resistance) plus Max Pain levels.",
  },
  {
    step: "03",
    title: "You Focus on Trading",
    body: "Instead of scanning hundreds of chains manually, you see stocks at important zones clearly — so you can spend your time on analysis and decision-making.",
  },
] as const;

const cardStyle = {
  backgroundColor: "#131a28",
  border: "1px solid rgba(90,140,220,0.12)",
};

export function FnoNinjaHowItWorksSection() {
  return (
    <section id="how-it-works" className={`${FB_CONTENT_SHELL} pt-20 sm:pt-24 lg:pt-28 pb-16 sm:pb-20 lg:pb-24`}>
      <div className="mb-10 sm:mb-12 max-w-3xl">
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          How FNO Ninja Works
        </h2>
        <p className="mt-4 sm:mt-5 text-base sm:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
          We make option chain analysis fast and practical.
        </p>
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

      <div className="mt-10 sm:mt-12 lg:mt-14 max-w-2xl mx-auto text-center space-y-2">
        <p className="text-sm sm:text-base font-semibold text-white/90">
          These levels are not predictions.
        </p>
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          But price often reacts around them.{" "}
          <a
            href="#features"
            className="font-semibold underline underline-offset-4 decoration-white/20 hover:decoration-white/50 transition-colors"
            style={{ color: FNO_ACCENT }}
          >
            See real examples below.
          </a>
        </p>
      </div>
    </section>
  );
}
