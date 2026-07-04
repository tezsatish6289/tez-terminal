"use client";

import { FnoNinjaLogo } from "@/components/fnoninja/FnoNinjaLogo";
import { TradingViewIcon } from "@/components/icons/exchange-icons";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  chartAttributionHeadline,
  chartAttributionMeta,
  type ChartAttributionVariant,
} from "@/lib/levels/chart-attribution-copy";

const GLASS = {
  background: "rgba(7, 13, 26, 0.62)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
} as const;

/** In-chart attribution: FNONINJA brand, methodology, and TradingView credit. */
export function LevelsChartAttributionOverlay({
  variant,
  levels,
  webChartUrl,
  showBrand = true,
  showMethodology = true,
  showTradingView = false,
  rightInsetPx = 0,
  visible = true,
  className = "",
}: {
  variant: ChartAttributionVariant;
  levels?: PublicLevels | null;
  webChartUrl?: string;
  showBrand?: boolean;
  showMethodology?: boolean;
  showTradingView?: boolean;
  /** Width of the right price axis so overlays sit inside the plot. */
  rightInsetPx?: number;
  visible?: boolean;
  className?: string;
}) {
  if (!visible) return null;

  const headline = chartAttributionHeadline(variant);
  const meta = chartAttributionMeta(levels);
  const tvUrl = webChartUrl?.trim();
  const showTv = showTradingView && Boolean(tvUrl);

  if (!showBrand && !showMethodology && !showTv) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[12] ${className}`.trim()}
      aria-hidden={!showTv}
    >
      {showBrand ? (
        <div
          className="absolute top-2 sm:top-2.5 flex items-center rounded-md px-1.5 py-1 sm:px-2 sm:py-1"
          style={{ right: Math.max(8, rightInsetPx + 6), ...GLASS }}
        >
          <FnoNinjaLogo size={18} wordmarkClassName="text-[9px] sm:text-[10px]" />
        </div>
      ) : null}

      {showTv && tvUrl ? (
        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute bottom-2 left-2 sm:bottom-2.5 sm:left-2.5 flex items-center gap-1 rounded-md px-1.5 py-1 transition-opacity hover:opacity-100 opacity-90"
          style={GLASS}
          aria-label="Open this chart on TradingView in a new tab. Press T or click."
        >
          <TradingViewIcon className="h-3.5 w-3.5 shrink-0 rounded-[3px]" aria-hidden />
          <span className="text-[8px] sm:text-[9px] font-semibold" style={{ color: "#94a3b8" }}>
            TradingView
          </span>
        </a>
      ) : null}

      {showMethodology ? (
        <div
          className={`absolute bottom-2 sm:bottom-2.5 left-2 flex justify-center px-2 ${showTv ? "pl-14 sm:pl-16" : ""}`}
          style={{ right: Math.max(8, rightInsetPx + 6) }}
        >
          <div
            className="max-w-[min(100%,28rem)] rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5 text-center"
            style={GLASS}
          >
            <p
              className="text-[8px] sm:text-[9px] font-medium leading-snug"
              style={{ color: "rgba(203, 213, 225, 0.92)" }}
            >
              {headline}
            </p>
            {meta ? (
              <p
                className="mt-0.5 text-[7px] sm:text-[8px] leading-snug"
                style={{ color: "rgba(100, 116, 139, 0.95)" }}
              >
                {meta}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
