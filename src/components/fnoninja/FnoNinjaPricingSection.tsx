import { FnoNinjaPlanCards } from "@/components/fnoninja/FnoNinjaPlanCards";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNO_LANDING_BORDER,
  GradientText,
  SectionEyebrow,
} from "@/lib/fnoninja/landing-ui";

export function FnoNinjaPricingSection() {
  return (
    <section id="pricing" className={`${FNO_LANDING_SHELL} relative overflow-hidden border-b py-16 sm:py-20 lg:py-24`} style={{ borderColor: FNO_LANDING_BORDER }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{ background: "radial-gradient(50% 60% at 50% 0%, rgba(59,130,246,0.12), transparent 70%)" }}
      />
      <div className="mb-10 sm:mb-12 max-w-2xl mx-auto text-center relative">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <h2 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Start free. <GradientText>Scale when you&apos;re ready.</GradientText>
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-400">
          7 days on us — no credit card. Then pick a plan that fits how you research the F&amp;O
          market.
        </p>
      </div>

      <FnoNinjaPlanCards className="relative" />

      <p className="mt-8 text-center text-[11px] leading-relaxed max-w-lg mx-auto text-slate-500">
        All plans include market map access. Charts &amp; Sentiment are free to explore; paid plans
        unlock the full toolkit. Informational data only — not investment advice.
      </p>
    </section>
  );
}
