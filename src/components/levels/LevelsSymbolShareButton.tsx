"use client";

import { useCallback, useMemo } from "react";
import { LevelsChartShareButton } from "@/components/levels/LevelsChartShareButton";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { buildSymbolChartShareContext } from "@/lib/levels/levels-share";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export function LevelsSymbolShareButton({
  scope,
  symbol,
  label,
  levels,
  expiryKey,
  nativeChartRef,
  iconOnly = false,
  disabled = false,
}: {
  scope: LevelsTvScope;
  symbol: string;
  label?: string | null;
  levels?: PublicLevels | null;
  expiryKey?: string | null;
  nativeChartRef?: React.RefObject<NativeCandlesChartHandle | null>;
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  const context = useMemo(() => {
    const hostname =
      typeof window !== "undefined" ? window.location.hostname : "fnoninja.com";
    return buildSymbolChartShareContext({
      hostname,
      scope,
      symbol,
      label,
      levels,
      expiryKey,
    });
  }, [scope, symbol, label, levels, expiryKey]);

  const captureImage = useCallback(async () => {
    if (!nativeChartRef?.current) return null;
    return nativeChartRef.current.captureShareImage({
      symbol,
      subtitle: label,
      shareUrl: context.shareUrl,
    });
  }, [nativeChartRef, symbol, label, context.shareUrl]);

  return (
    <LevelsChartShareButton
      context={context}
      captureImage={nativeChartRef ? captureImage : undefined}
      iconOnly={iconOnly}
      disabled={disabled}
    />
  );
}
