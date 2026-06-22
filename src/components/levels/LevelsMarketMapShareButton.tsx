"use client";

import { useMemo } from "react";
import { LevelsChartShareButton } from "@/components/levels/LevelsChartShareButton";
import { buildMarketMapShareContext } from "@/lib/levels/levels-share";

export function LevelsMarketMapShareButton({
  viewLabel,
  iconOnly = false,
}: {
  viewLabel?: string;
  iconOnly?: boolean;
}) {
  const context = useMemo(() => {
    const hostname =
      typeof window !== "undefined" ? window.location.hostname : "fnoninja.com";
    return buildMarketMapShareContext({ hostname, viewLabel });
  }, [viewLabel]);

  return <LevelsChartShareButton context={context} iconOnly={iconOnly} />;
}
