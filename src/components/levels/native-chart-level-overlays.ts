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
import { computeZoneSlAnchors } from "@/lib/zones/zone-sl-anchors";

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

const COMPACT_PRICE_LINE_TITLES: Record<string, string> = {
  "Resistance H": "Res H",
  "Resistance L": "Res L",
  "Call OI peak": "Call OI",
  "Resistance Break": "Res Brk",
  "Support H": "Sup H",
  "Support L": "Sup L",
  "Put OI peak": "Put OI",
  "Support Break": "Sup Brk",
  "Max Pain": "MP",
};

function priceLineTitle(title: string, compactTitles: boolean): string {
  return compactTitles ? (COMPACT_PRICE_LINE_TITLES[title] ?? title) : title;
}

/** Round price for coincident level detection (2 dp). */
export function priceLevelKey(price: number): number {
  return Math.round(price * 100) / 100;
}

export interface PriceLineSpec {
  price: number;
  color: string;
  title: string;
  style: LineStyle;
  width: 1 | 2 | 3 | 4;
  /** Lower = listed first when titles merge at the same price. */
  mergeOrder: number;
}

/** One axis label per price — e.g. "Max Pain · Put OI" when both pin to 900. */
export function mergeCoincidentPriceLines(
  specs: PriceLineSpec[],
  compactTitles: boolean,
): PriceLineSpec[] {
  const groups = new Map<number, PriceLineSpec[]>();
  for (const spec of specs) {
    const key = priceLevelKey(spec.price);
    const bucket = groups.get(key) ?? [];
    bucket.push(spec);
    groups.set(key, bucket);
  }

  const merged: PriceLineSpec[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }
    group.sort((a, b) => a.mergeOrder - b.mergeOrder || a.title.localeCompare(b.title));
    const titles = group.map((g) => priceLineTitle(g.title, compactTitles));
    const separator = compactTitles ? "·" : " · ";
    const primary =
      group.find((g) => g.title === "Max Pain") ??
      group.find((g) => g.title.includes("OI peak")) ??
      group[0]!;
    merged.push({
      price: group[0]!.price,
      color: primary.color,
      title: titles.join(separator),
      style: primary.style,
      width: Math.max(...group.map((g) => g.width)) as 1 | 2 | 3 | 4,
      mergeOrder: primary.mergeOrder,
    });
  }
  return merged.sort((a, b) => b.price - a.price);
}

function lineFocusedPart(part: string, focus: LevelVisualFocus): boolean {
  if (focus === "call") {
    return (
      part === "Resistance H" ||
      part === "Resistance L" ||
      part === "Res H" ||
      part === "Res L" ||
      part === "Call OI peak" ||
      part === "Call OI" ||
      part === "Resistance Break" ||
      part === "Res Brk"
    );
  }
  if (focus === "put") {
    return (
      part === "Support H" ||
      part === "Support L" ||
      part === "Sup H" ||
      part === "Sup L" ||
      part === "Put OI peak" ||
      part === "Put OI" ||
      part === "Support Break" ||
      part === "Sup Brk"
    );
  }
  return part === "Max Pain" || part === "MP";
}

function lineFocused(title: string, focus: LevelVisualFocus | null | undefined): boolean {
  if (!focus || focus === "expiry") return true;
  const parts = title.split(" · ").map((p) => p.trim());
  if (parts.length > 1) {
    return parts.some((part) => lineFocusedPart(part, focus));
  }
  return lineFocusedPart(title, focus);
}

export function applyLevelPriceLines(
  series: ISeriesApi<"Candlestick">,
  priceLinesRef: { current: IPriceLine[] },
  levels: PublicLevels | null | undefined,
  visualFocus?: LevelVisualFocus | null,
  compactTitles = false,
): void {
  for (const line of priceLinesRef.current) series.removePriceLine(line);
  priceLinesRef.current = [];
  if (!levels) return;

  const anchors = zoneSlAnchors(levels);

  const rawSpecs: PriceLineSpec[] = [];
  const push = (
    price: number | null | undefined,
    color: string,
    title: string,
    style: LineStyle,
    width: 1 | 2 | 3 | 4,
    mergeOrder: number,
  ) => {
    if (price == null || !Number.isFinite(price)) return;
    rawSpecs.push({ price, color, title, style, width, mergeOrder });
  };

  push(levels.bearHigh, LEVELS_ZONE_CHART.bear.line, "Resistance H", LineStyle.Dashed, 1, 20);
  push(levels.bearLow, LEVELS_ZONE_CHART.bear.line, "Resistance L", LineStyle.Dashed, 1, 21);
  push(
    levels.callClusterStrike,
    LEVELS_ZONE_CHART.bear.line,
    "Call OI peak",
    LineStyle.Dotted,
    1,
    11,
  );
  push(anchors.bearSl, LEVELS_ZONE_CHART.bear.lineInv, "Resistance Break", LineStyle.Dotted, 2, 30);
  push(levels.poc, LEVELS_ZONE_CHART.maxPain.line, "Max Pain", LineStyle.Dashed, 2, 0);
  push(levels.bullHigh, LEVELS_ZONE_CHART.bull.line, "Support H", LineStyle.Dashed, 1, 22);
  push(levels.bullLow, LEVELS_ZONE_CHART.bull.line, "Support L", LineStyle.Dashed, 1, 23);
  push(
    levels.putClusterStrike,
    LEVELS_ZONE_CHART.bull.line,
    "Put OI peak",
    LineStyle.Dotted,
    1,
    10,
  );
  push(anchors.bullSl, LEVELS_ZONE_CHART.bull.lineInv, "Support Break", LineStyle.Dotted, 2, 31);

  for (const spec of mergeCoincidentPriceLines(rawSpecs, compactTitles)) {
    const focused = lineFocused(spec.title, visualFocus);
    const lineColor = visualFocus && !focused ? withAlpha(spec.color, 0.38) : spec.color;
    const lineWidth =
      visualFocus && focused
        ? (Math.min(spec.width + 1, 4) as 1 | 2 | 3 | 4)
        : spec.width;
    priceLinesRef.current.push(
      series.createPriceLine({
        price: spec.price,
        color: lineColor,
        lineWidth,
        lineStyle: spec.style,
        axisLabelVisible: true,
        title: spec.title,
      }),
    );
  }
}
