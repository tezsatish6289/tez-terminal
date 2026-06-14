"use client";

import { FnoNinjaAuthTracker } from "@/components/fnoninja/FnoNinjaAuthTracker";
import { FnoNinjaPostLoginRedirect } from "@/components/fnoninja/FnoNinjaPostLoginRedirect";
import { FnoNinjaTrialActivator } from "@/components/fnoninja/FnoNinjaTrialActivator";
import { FnoNinjaLiveslideWalkthroughProvider } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

export function FnoNinjaClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <FnoNinjaLiveslideWalkthroughProvider>
      <FnoNinjaAuthTracker />
      <FnoNinjaPostLoginRedirect />
      <FnoNinjaTrialActivator />
      {children}
    </FnoNinjaLiveslideWalkthroughProvider>
  );
}
