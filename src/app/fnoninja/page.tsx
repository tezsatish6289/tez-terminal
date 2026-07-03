import { FnoNinjaLandingGate } from "@/components/fnoninja/FnoNinjaPostLoginRedirect";
import { FnoNinjaHero } from "@/components/fnoninja/FnoNinjaHero";
import { FnoNinjaComboSection } from "@/components/fnoninja/FnoNinjaComboSection";
import { FnoNinjaHowItWorksSection } from "@/components/fnoninja/FnoNinjaHowItWorksSection";
import { FnoNinjaSrReplaysSection } from "@/components/fnoninja/FnoNinjaSrReplaysSection";
import { FnoNinjaDisclaimerSection } from "@/components/fnoninja/FnoNinjaDisclaimerSection";
import { FnoNinjaPricingSection } from "@/components/fnoninja/FnoNinjaPricingSection";
import { FnoNinjaWhoItsForSection } from "@/components/fnoninja/FnoNinjaWhoItsForSection";
import { FnoNinjaCommunitySection } from "@/components/fnoninja/FnoNinjaCommunitySection";
import { FnoNinjaAtlasPromoSection } from "@/components/fnoninja/FnoNinjaAtlasPromoSection";
import { FnoNinjaSocialSection } from "@/components/fnoninja/FnoNinjaSocialSection";

function FnoNinjaLandingPageContent() {
  return (
    <div className="font-sans antialiased min-w-0 flex flex-col flex-1">
      <FnoNinjaHero />

      <FnoNinjaComboSection />

      <FnoNinjaSrReplaysSection />

      <FnoNinjaHowItWorksSection />

      <FnoNinjaCommunitySection />

      <FnoNinjaAtlasPromoSection />

      <FnoNinjaWhoItsForSection />

      <FnoNinjaPricingSection />

      <FnoNinjaDisclaimerSection />

      <FnoNinjaSocialSection />
    </div>
  );
}

export default function FnoNinjaLandingPage() {
  return (
    <FnoNinjaLandingGate>
      <FnoNinjaLandingPageContent />
    </FnoNinjaLandingGate>
  );
}
