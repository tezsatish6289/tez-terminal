import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { FnoNinjaPricingTrialCta } from "@/components/fnoninja/FnoNinjaPricingTrialCta";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import { FNONINJA_PRICING_TIERS, formatInr } from "@/lib/fnoninja/pricing";
import { FNO_CTA_GRADIENT } from "@/lib/fnoninja/theme";
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 relative">
        {FNONINJA_PRICING_TIERS.map((tier) => (
          <div key={tier.id} className={`relative ${tier.highlight ? "lg:-my-2" : ""}`}>
            {tier.highlight ? (
              <div
                aria-hidden
                className="absolute -inset-3 -z-10 rounded-3xl opacity-70 blur-2xl"
                style={{
                  background:
                    "conic-gradient(from 120deg at 50% 50%, rgba(59,130,246,0.35), rgba(139,92,246,0.25), rgba(59,130,246,0.35))",
                }}
              />
            ) : null}
            <article
              className={`relative rounded-2xl p-6 sm:p-7 flex h-full flex-col ${
                tier.highlight
                  ? "border border-[#3b82f6]/40 bg-gradient-to-b from-[#3b82f6]/[0.14] via-[#0b1428] to-[#0a1120] shadow-[0_20px_60px_-20px_rgba(59,130,246,0.4)]"
                  : ""
              }`}
              style={tier.highlight ? undefined : { border: `1px solid ${FNO_LANDING_BORDER}`, backgroundColor: "#0d1830" }}
            >
            <div className="flex items-start justify-between gap-2 mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {tier.label}
              </p>
              {tier.badge ? (
                <span
                  className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
                    tier.highlight
                      ? "bg-[#3b82f6] text-white"
                      : "border bg-[#0d1830] text-slate-400"
                  }`}
                  style={{
                    borderColor: tier.highlight ? "transparent" : FNO_LANDING_BORDER,
                  }}
                >
                  {tier.badge}
                </span>
              ) : null}
            </div>

            <div className="mb-5">
              {tier.priceInr === null ? (
                <>
                  <p className="text-3xl sm:text-4xl font-black text-white leading-none">Free</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {tier.periodLabel} · no credit card
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl sm:text-4xl font-black text-white leading-none">
                    {formatInr(tier.priceInr)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {tier.periodLabel}
                    {tier.pricePerDayInr ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-slate-400">
                          {formatInr(tier.pricePerDayInr)}/day
                        </span>
                      </>
                    ) : null}
                  </p>
                </>
              )}
            </div>

            <ul className="space-y-2.5 text-[13px] leading-relaxed flex-1 mb-6 text-slate-400">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <CheckCircle2
                    className="h-3.5 w-3.5 flex-shrink-0 mt-0.5"
                    style={{ color: tier.highlight ? "#60a5fa" : "#475569" }}
                  />
                  {feature}
                </li>
              ))}
            </ul>

            {tier.id === "trial" ? (
              <FnoNinjaPricingTrialCta className="w-full" />
            ) : (
              <Link
                href="/subscribe"
                className="w-full inline-flex items-center justify-center py-3 rounded-xl text-sm font-bold text-white transition-transform hover:scale-[1.02]"
                style={{ background: FNO_CTA_GRADIENT }}
              >
                Subscribe
              </Link>
            )}
            </article>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed max-w-lg mx-auto text-slate-500">
        All plans include market map access. Paid subscriptions unlock symbol charts, liveslide, and
        deep-dive analytics. Informational data only — not investment advice.
      </p>
    </section>
  );
}
