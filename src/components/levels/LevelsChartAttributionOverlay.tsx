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

const FOOTER_ROW_BOTTOM_CLASS: Record<ChartAttributionVariant, string> = {
  intraday: "bottom-2 sm:bottom-2.5",
  trend: "bottom-2 sm:bottom-2.5",
  outlook: "bottom-2 sm:bottom-2.5",
  history: "bottom-2 sm:bottom-2.5",
};

const BRAND_BOTTOM_CLASS = FOOTER_ROW_BOTTOM_CLASS;

const METHODOLOGY_BOTTOM_CLASS: Record<ChartAttributionVariant, string> = {
  intraday: "bottom-12 sm:bottom-14",
  trend: "bottom-8 sm:bottom-9",
  outlook: "bottom-8 sm:bottom-9",
  history: "bottom-8 sm:bottom-9",
};

function BrandTradingViewRow({
  showBrand,
  showTv,
  tvUrl,
}: {
  showBrand: boolean;
  showTv: boolean;
  tvUrl: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1 sm:px-2 sm:py-1" style={GLASS}>
      {showBrand ? (
        <FnoNinjaLogo
          size={18}
          squareMark
          markClassName="rounded-none"
          wordmarkClassName="text-[9px] sm:text-[10px]"
        />
      ) : null}
      {showBrand && showTv ? (
        <span className="h-3 w-px shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
      ) : null}
      {showTv ? (
        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto flex items-center gap-1 transition-opacity hover:opacity-100 opacity-90"
          aria-label="Open this chart on TradingView in a new tab. Press T or click."
        >
          <TradingViewIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="text-[8px] sm:text-[9px] font-semibold" style={{ color: "#94a3b8" }}>
            TradingView
          </span>
        </a>
      ) : null}
    </div>
  );
}

function MethodologyNote({
  headline,
  meta,
}: {
  headline: string;
  meta: string | null;
}) {
  return (
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
  );
}

const FOOTER_ROW_GRID_CLASS = "grid grid-cols-[1fr_auto_1fr] items-center gap-2";

function FooterRow({
  variant,
  placement,
  plotRight,
  className,
  showBrand,
  showTv,
  tvUrl,
  headline,
  meta,
}: {
  variant: ChartAttributionVariant;
  placement: "overlay" | "below";
  plotRight: number;
  className: string;
  showBrand: boolean;
  showTv: boolean;
  tvUrl: string;
  headline: string;
  meta: string | null;
}) {
  const content = (
    <>
      <div className="justify-self-start min-w-0 pointer-events-auto">
        <BrandTradingViewRow showBrand={showBrand} showTv={showTv} tvUrl={tvUrl} />
      </div>
      <MethodologyNote headline={headline} meta={meta} />
      <div aria-hidden />
    </>
  );

  if (placement === "below") {
    return (
      <div
        className={`shrink-0 w-full px-2 sm:px-2.5 pt-1 pb-0.5 ${FOOTER_ROW_GRID_CLASS} ${className}`.trim()}
        style={{ paddingRight: plotRight }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute left-2 sm:left-2.5 z-[20] ${FOOTER_ROW_GRID_CLASS} ${FOOTER_ROW_BOTTOM_CLASS[variant]} ${className}`.trim()}
      style={{ right: plotRight }}
    >
      {content}
    </div>
  );
}

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
  placement = "overlay",
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
  /** Below-chart row for panes with a visible time scale (intraday). */
  placement?: "overlay" | "below";
}) {
  if (!visible) return null;

  const headline = chartAttributionHeadline(variant);
  const meta = chartAttributionMeta(levels, variant);
  const tvUrl = webChartUrl?.trim() ?? "";
  const showTv = showTradingView && Boolean(tvUrl);
  const showBrandRow = showBrand || showTv;
  const plotRight = Math.max(8, rightInsetPx + 6);
  const useFooterRow =
    (variant === "trend" || variant === "intraday") && showBrandRow && showMethodology;

  if (!showBrandRow && !showMethodology) return null;

  if (useFooterRow) {
    return (
      <FooterRow
        variant={variant}
        placement={placement}
        plotRight={plotRight}
        className={className}
        showBrand={showBrand}
        showTv={showTv}
        tvUrl={tvUrl}
        headline={headline}
        meta={meta}
      />
    );
  }

  if (placement === "below") {
    return (
      <div
        className={`shrink-0 w-full px-2 sm:px-2.5 pt-1 pb-0.5 ${className}`.trim()}
        style={{ paddingRight: plotRight }}
        aria-hidden={!showTv}
      >
        {showBrandRow ? (
          <BrandTradingViewRow showBrand={showBrand} showTv={showTv} tvUrl={tvUrl} />
        ) : null}
        {showMethodology ? (
          <div className="mt-1 flex justify-center">
            <MethodologyNote headline={headline} meta={meta} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[12] ${className}`.trim()}
      aria-hidden={!showTv}
    >
      {showBrandRow ? (
        <div className={`absolute left-2 sm:left-2.5 ${BRAND_BOTTOM_CLASS[variant]}`}>
          <BrandTradingViewRow showBrand={showBrand} showTv={showTv} tvUrl={tvUrl} />
        </div>
      ) : null}

      {showMethodology ? (
        <div
          className={`absolute left-2 flex justify-center px-2 ${METHODOLOGY_BOTTOM_CLASS[variant]} ${showBrandRow ? "pl-28 sm:pl-32" : ""}`}
          style={{ right: plotRight }}
        >
          <MethodologyNote headline={headline} meta={meta} />
        </div>
      ) : null}
    </div>
  );
}
