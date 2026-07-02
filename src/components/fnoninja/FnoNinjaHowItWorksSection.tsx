import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNO_LANDING_FOLD_CLASS } from "@/lib/fnoninja/responsive";
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
    <section
      id="how-it-works"
      className={`${FNO_LANDING_SHELL} ${FNO_LANDING_FOLD_CLASS} flex flex-col py-10 sm:py-12 lg:py-14`}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="mb-8 sm:mb-10 max-w-3xl">
          <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
            How FNO Ninja Works
          </h2>
          <p className="mt-4 sm:mt-5 text-base sm:text-lg leading-relaxed" style={{ color: FNO_MUTED }}>
            We make option chain analysis fast and practical.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 items-stretch gap-4 sm:grid-cols-3 lg:gap-5">
          {STEPS.map(({ step, title, body }) => (
            <div key={step} className="flex h-full flex-col rounded-2xl p-6 sm:p-8 lg:p-10" style={cardStyle}>
              <p
                className="text-base font-bold font-mono tracking-wide mb-5 sm:mb-6"
                style={{ color: FNO_ACCENT }}
              >
                {step}
              </p>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-white leading-snug">{title}</h3>
              <p className="mt-4 text-sm sm:text-base lg:text-[17px] leading-relaxed" style={{ color: FNO_MUTED }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
