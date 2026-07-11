"use client";

import { FnoNinjaAuthTracker } from "@/components/fnoninja/FnoNinjaAuthTracker";
import { FnoNinjaDayPassReconciler } from "@/components/fnoninja/FnoNinjaDayPassReconciler";
import { FnoNinjaPostLoginRedirect } from "@/components/fnoninja/FnoNinjaPostLoginRedirect";
import { FnoNinjaTrialActivator } from "@/components/fnoninja/FnoNinjaTrialActivator";
import { FnoNinjaUpgradePromptProvider } from "@/components/fnoninja/FnoNinjaUpgradePrompt";
import { FnoNinjaLiveslideWalkthroughProvider } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

export function FnoNinjaClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <FnoNinjaLiveslideWalkthroughProvider>
      <FnoNinjaUpgradePromptProvider>
        <FnoNinjaAuthTracker />
        <FnoNinjaPostLoginRedirect />
        <FnoNinjaTrialActivator />
        <FnoNinjaDayPassReconciler />
        {children}
      </FnoNinjaUpgradePromptProvider>
    </FnoNinjaLiveslideWalkthroughProvider>
  );
}
