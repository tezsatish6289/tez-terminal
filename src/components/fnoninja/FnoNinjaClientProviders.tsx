"use client";

import { FnoNinjaAuthTracker } from "@/components/fnoninja/FnoNinjaAuthTracker";
import { FnoNinjaTrialActivator } from "@/components/fnoninja/FnoNinjaTrialActivator";
import { FnoNinjaLiveslideWalkthroughProvider } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

export function FnoNinjaClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <FnoNinjaLiveslideWalkthroughProvider>
      <FnoNinjaAuthTracker />
      <FnoNinjaTrialActivator />
      {children}
    </FnoNinjaLiveslideWalkthroughProvider>
  );
}
