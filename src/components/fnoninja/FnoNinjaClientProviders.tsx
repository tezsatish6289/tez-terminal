"use client";

import { FnoNinjaAffiliateTracker } from "@/components/fnoninja/FnoNinjaAffiliateTracker";
import { FnoNinjaAuthTracker } from "@/components/fnoninja/FnoNinjaAuthTracker";
import { FnoNinjaDayPassReconciler } from "@/components/fnoninja/FnoNinjaDayPassReconciler";
import { FnoNinjaPhoneGate } from "@/components/fnoninja/FnoNinjaPhoneGate";
import { FnoNinjaPostLoginRedirect } from "@/components/fnoninja/FnoNinjaPostLoginRedirect";
import { FnoNinjaReferralCodePrompt } from "@/components/fnoninja/FnoNinjaReferralCodePrompt";
import { FnoNinjaTrialActivator } from "@/components/fnoninja/FnoNinjaTrialActivator";
import { FnoNinjaTrialActivityTracker } from "@/components/fnoninja/FnoNinjaTrialActivityTracker";
import { FnoNinjaUpgradePromptProvider } from "@/components/fnoninja/FnoNinjaUpgradePrompt";
import { FnoNinjaLiveslideWalkthroughProvider } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

export function FnoNinjaClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <FnoNinjaLiveslideWalkthroughProvider>
      <FnoNinjaUpgradePromptProvider>
        <FnoNinjaAffiliateTracker />
        <FnoNinjaAuthTracker />
        <FnoNinjaTrialActivityTracker />
        <FnoNinjaPostLoginRedirect />
        <FnoNinjaTrialActivator />
        <FnoNinjaReferralCodePrompt />
        <FnoNinjaDayPassReconciler />
        <FnoNinjaPhoneGate />
        {children}
      </FnoNinjaUpgradePromptProvider>
    </FnoNinjaLiveslideWalkthroughProvider>
  );
}
