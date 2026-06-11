"use client";

import { FnoNinjaAuthTracker } from "@/components/fnoninja/FnoNinjaAuthTracker";

export function FnoNinjaClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FnoNinjaAuthTracker />
      {children}
    </>
  );
}
