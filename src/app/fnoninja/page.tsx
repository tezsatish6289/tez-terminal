import { FnoNinjaCtaLink } from "@/components/fnoninja/FnoNinjaCtaLink";
import { FnoNinjaHero } from "@/components/fnoninja/FnoNinjaHero";
import { FnoNinjaFeaturesSection } from "@/components/fnoninja/FnoNinjaFeaturesSection";
import { FnoNinjaHowItWorksSection } from "@/components/fnoninja/FnoNinjaHowItWorksSection";
import { FnoNinjaProblemSection } from "@/components/fnoninja/FnoNinjaProblemSection";
import { FnoNinjaDisclaimerSection } from "@/components/fnoninja/FnoNinjaDisclaimerSection";
import { FnoNinjaPricingSection } from "@/components/fnoninja/FnoNinjaPricingSection";
import { FnoNinjaWhoItsForSection } from "@/components/fnoninja/FnoNinjaWhoItsForSection";
import { FnoNinjaCommunitySection } from "@/components/fnoninja/FnoNinjaCommunitySection";
import { FnoNinjaSocialSection } from "@/components/fnoninja/FnoNinjaSocialSection";
import { FB_NARROW_SHELL } from "@/lib/freedombot/responsive";
import { FNO_ACCENT, FNO_MUTED, FNO_NAV_BORDER } from "@/lib/fnoninja/theme";

export default function FnoNinjaLandingPage() {
  return (
    <div className="font-sans antialiased min-w-0 flex flex-col flex-1">
      <FnoNinjaHero />

      <FnoNinjaProblemSection />

      <FnoNinjaHowItWorksSection />

      <FnoNinjaFeaturesSection />

      <FnoNinjaWhoItsForSection />

      <FnoNinjaCommunitySection />

      <FnoNinjaPricingSection />

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

      <FnoNinjaDisclaimerSection />

      <FnoNinjaSocialSection />
    </div>
  );
}
