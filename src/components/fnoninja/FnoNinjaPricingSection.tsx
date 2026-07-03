import { CheckCircle2 } from "lucide-react";
import { FnoNinjaPricingTrialCta } from "@/components/fnoninja/FnoNinjaPricingTrialCta";
import { FNO_LANDING_SHELL } from "@/lib/freedombot/responsive";
import {
  FNONINJA_PRICING_TIERS,
  formatInr,
} from "@/lib/fnoninja/pricing";
import { FNO_ACCENT, FNO_CTA_GRADIENT, FNO_MUTED, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

const cardBase = {
  backgroundColor: "#131a28",
  border: "1px solid rgba(90,140,220,0.12)",
} as const;

const cardHighlight = {
  backgroundColor: "#0f1729",
  border: "1px solid rgba(96,165,250,0.35)",
  boxShadow: "0 0 0 1px rgba(96,165,250,0.08), 0 20px 50px rgba(0,0,0,0.35)",
} as const;

export function FnoNinjaPricingSection() {
  return (
    <section
      id="pricing"
      className={`${FNO_LANDING_SHELL} py-16 sm:py-20 lg:py-24`}
      style={{ borderTop: `1px solid ${FNO_NAV_BORDER}` }}
    >
      <div className="mb-10 sm:mb-12 max-w-2xl mx-auto text-center">
        <p
          className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] font-mono mb-4"
          style={{ color: FNO_ACCENT }}
        >
          Pricing
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-white tracking-tight leading-[1.1]">
          Start free. Scale when you&apos;re ready.
        </h2>
        <p className="mt-4 text-sm sm:text-base leading-relaxed" style={{ color: FNO_MUTED }}>
          One month on us — no credit card. Then pick a plan that fits how you research the F&amp;O
          market.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
        {FNONINJA_PRICING_TIERS.map((tier) => (
          <article
            key={tier.id}
            className="rounded-2xl p-6 sm:p-7 flex flex-col"
            style={tier.highlight ? cardHighlight : cardBase}
          >
            <div className="flex items-start justify-between gap-2 mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                {tier.label}
              </p>
              {tier.badge ? (
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    color: tier.highlight ? "#93c5fd" : "#64748b",
                    backgroundColor: tier.highlight ? "rgba(37,99,235,0.2)" : "rgba(30,41,59,0.8)",
                    border: "1px solid rgba(90,140,220,0.15)",
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
                  <p className="mt-2 text-xs" style={{ color: "#64748b" }}>
                    {tier.periodLabel} · no credit card
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl sm:text-4xl font-black text-white leading-none">
                    {formatInr(tier.priceInr)}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: "#64748b" }}>
                    {tier.periodLabel}
                    {tier.pricePerDayInr ? (
                      <>
                        {" "}
                        ·{" "}
                        <span style={{ color: "#94a3b8" }}>
                          {formatInr(tier.pricePerDayInr)}/day
                        </span>
                      </>
                    ) : null}
                  </p>
                </>
              )}
            </div>

            <ul className="space-y-2.5 text-[13px] leading-relaxed flex-1 mb-6" style={{ color: FNO_MUTED }}>
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
              <button
                type="button"
                disabled
                className="w-full py-3 rounded-xl text-sm font-bold text-white opacity-50 cursor-not-allowed"
                style={{ background: FNO_CTA_GRADIENT }}
                title="Paid plans coming soon"
              >
                Coming soon
              </button>
            )}
          </article>
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed max-w-lg mx-auto" style={{ color: "#475569" }}>
        All plans include market map access. Paid subscriptions unlock symbol charts, liveslide, and
        deep-dive analytics. Informational data only — not investment advice.
      </p>
    </section>
  );
}
