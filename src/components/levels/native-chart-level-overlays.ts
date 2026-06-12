import {
  LineStyle,
  type CandlestickData,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { computeZoneSlAnchors } from "@/lib/zone-bot-engine";

export interface ZoneSlAnchors {
  bullSl: number | null;
  bearSl: number | null;
}

export function zoneSlAnchors(levels: PublicLevels): ZoneSlAnchors {
  const { bullSl, bearSl } = computeZoneSlAnchors({
    halfWidthUsd: levels.bandOffset,
    bullZoneLow: levels.bullLow,
    bullZoneHigh: levels.bullHigh,
    bearZoneLow: levels.bearLow,
    bearZoneHigh: levels.bearHigh,
  });
  return { bullSl, bearSl };
}

/** Constant top edge for baseline fill (same times as candles). */
export function bandLineData(
  candles: CandlestickData[],
  topPrice: number,
): { time: Time; value: number }[] {
  return candles.map((c) => ({ time: c.time as UTCTimestamp, value: topPrice }));
}

export function collectOverlayPrices(
  levels: PublicLevels,
  anchors: ZoneSlAnchors,
): number[] {
  const out: number[] = [];
  const push = (v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) out.push(v);
  };
  push(levels.bullLow);
  push(levels.bullHigh);
  push(levels.bearLow);
  push(levels.bearHigh);
  push(levels.poc);
  push(levels.putClusterStrike);
  push(levels.callClusterStrike);
  push(anchors.bullSl);
  push(anchors.bearSl);
  return out;
}

/** Price span for autoscale (minValue/maxValue) and setVisibleRange (from/to). */
export function mergedPriceRange(
  candles: CandlestickData[],
  levels: PublicLevels | null | undefined,
  padRatio = 0.06,
): { minValue: number; maxValue: number; from: number; to: number } | null {
  const prices: number[] = [];
  for (const c of candles) {
    prices.push(c.high, c.low);
  }
  if (levels) {
    prices.push(...collectOverlayPrices(levels, zoneSlAnchors(levels)));
  }
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max((max - min) * padRatio, 0.5);
  const from = min - pad;
  const to = max + pad;
  return { minValue: from, maxValue: to, from, to };
}

export type LevelVisualFocus = "put" | "call" | "maxPain" | "expiry";

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lineFocused(title: string, focus: LevelVisualFocus | null | undefined): boolean {
  if (!focus || focus === "expiry") return true;
  if (focus === "call") {
    return (
      title === "Resistance H" ||
      title === "Resistance L" ||
      title === "Call OI peak" ||
      title === "Resistance Break"
    );
  }
  if (focus === "put") {
    return (
      title === "Support H" ||
      title === "Support L" ||
      title === "Put OI peak" ||
      title === "Support Break"
    );
  }
  return title === "Max Pain";
}

export function bandFillForFocus(
  side: "bull" | "bear",
  focus: LevelVisualFocus | null | undefined,
): { topFillColor1: string; topFillColor2: string } {
  const palette = side === "bull" ? LEVELS_ZONE_CHART.bull : LEVELS_ZONE_CHART.bear;
  const focused =
    focus === "expiry" ||
    (focus === "put" && side === "bull") ||
    (focus === "call" && side === "bear");

  if (focused) {
    return {
      topFillColor1: palette.nativeBandTop,
      topFillColor2: palette.nativeBandBottom,
    };
  }
  if (focus === "maxPain") {
    return {
      topFillColor1: side === "bull" ? "rgba(34, 197, 94, 0.24)" : "rgba(239, 68, 68, 0.24)",
      topFillColor2: side === "bull" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
    };
  }
  return {
    topFillColor1: side === "bull" ? "rgba(34, 197, 94, 0.22)" : "rgba(239, 68, 68, 0.22)",
    topFillColor2: side === "bull" ? "rgba(34, 197, 94, 0.09)" : "rgba(239, 68, 68, 0.09)",
  };
}

export function applyLevelPriceLines(
  series: ISeriesApi<"Candlestick">,
  priceLinesRef: { current: IPriceLine[] },
  levels: PublicLevels | null | undefined,
  visualFocus?: LevelVisualFocus | null,
): void {
  for (const line of priceLinesRef.current) series.removePriceLine(line);
  priceLinesRef.current = [];
  if (!levels) return;

  const anchors = zoneSlAnchors(levels);

  const add = (
    price: number | null | undefined,
    color: string,
    title: string,
    style: LineStyle = LineStyle.Dashed,
    width: 1 | 2 | 3 | 4 = 1,
  ) => {
    if (price == null || !Number.isFinite(price)) return;
    const focused = lineFocused(title, visualFocus);
    const lineColor = visualFocus && !focused ? withAlpha(color, 0.38) : color;
    const lineWidth = visualFocus && focused ? Math.min(width + 1, 4) as 1 | 2 | 3 | 4 : width;
    priceLinesRef.current.push(
      series.createPriceLine({
        price,
        color: lineColor,
        lineWidth,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      }),
    );
  };

  add(levels.bearHigh, LEVELS_ZONE_CHART.bear.line, "Resistance H");
  add(levels.bearLow, LEVELS_ZONE_CHART.bear.line, "Resistance L");
  add(
    levels.callClusterStrike,
    LEVELS_ZONE_CHART.bear.line,
    "Call OI peak",
    LineStyle.Dotted,
    1,
  );
  add(anchors.bearSl, LEVELS_ZONE_CHART.bear.lineInv, "Resistance Break", LineStyle.Dotted, 2);
  add(levels.poc, LEVELS_ZONE_CHART.maxPain.line, "Max Pain", LineStyle.Dashed, 2);
  add(levels.bullHigh, LEVELS_ZONE_CHART.bull.line, "Support H");
  add(levels.bullLow, LEVELS_ZONE_CHART.bull.line, "Support L");
  add(
    levels.putClusterStrike,
    LEVELS_ZONE_CHART.bull.line,
    "Put OI peak",
    LineStyle.Dotted,
    1,
  );
  add(anchors.bullSl, LEVELS_ZONE_CHART.bull.lineInv, "Support Break", LineStyle.Dotted, 2);
}
