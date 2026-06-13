"use client";

import { FnoNinjaAuthTracker } from "@/components/fnoninja/FnoNinjaAuthTracker";
import { FnoNinjaLiveslideWalkthroughProvider } from "@/components/fnoninja/liveslide/FnoNinjaLiveslideWalkthroughContext";

export function FnoNinjaClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <FnoNinjaLiveslideWalkthroughProvider>
      <FnoNinjaAuthTracker />
      {children}
    </FnoNinjaLiveslideWalkthroughProvider>
  );
}
