"use client";

import { prefetchProblemShowcase } from "@/lib/levels/resolve-problem-showcase";

/** Kick off second-fold chart data as soon as the homepage client bundle loads. */
prefetchProblemShowcase();

export function FnoNinjaProblemShowcasePrefetch() {
  return null;
}
