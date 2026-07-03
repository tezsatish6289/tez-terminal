import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

const STEPS = [
  {
    step: "01",
    title: "Scan Everything",
    body: "We process option-chain data for 200+ NSE F&O stocks and major indices throughout the trading session.",
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

export function FnoNinjaHowItWorksSection() {
  return (
    <section id="how" className="relative border-b" style={{ borderColor: FNO_LANDING_BORDER }}>
      <div className={`${FNO_LANDING_SHELL} py-16 sm:py-20 lg:py-24`}>
        <div className="max-w-3xl">
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
            See the structure. <GradientText>Skip the scanning.</GradientText>
          </h2>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base leading-relaxed text-slate-400">
            Three steps to turn raw option-chain data into clear support, resistance, and max-pain
            context.
          </p>
        </div>

        <div className="relative mt-12 grid gap-4 sm:grid-cols-3 lg:gap-5">
          <div
            aria-hidden
            className="pointer-events-none absolute left-8 right-8 top-6 hidden h-px bg-gradient-to-r from-transparent via-[#3b82f6]/40 to-transparent sm:block"
          />
          {STEPS.map(({ step, title, body }) => (
            <div
              key={step}
              className="group relative rounded-2xl border bg-gradient-to-b from-white/[0.03] to-transparent p-6 transition hover:border-[#3b82f6]/50"
              style={{ borderColor: FNO_LANDING_BORDER, backgroundColor: "#0d1830" }}
            >
              <p className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#3b82f6]/30 bg-[#080f1e] text-sm font-black tracking-wider text-[#60a5fa] shadow-[0_0_30px_rgba(59,130,246,0.25)]">
                {step}
              </p>
              <h3 className="mt-5 text-lg sm:text-xl lg:text-2xl font-bold text-white leading-snug">{title}</h3>
              <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-400">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
