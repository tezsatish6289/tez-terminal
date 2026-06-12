import {
  LineStyle,
  type CandlestickData,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { computeZoneSlAnchors } from "@/lib/zone-bot-engine";
import { bandLineData } from "@/components/levels/native-chart-level-overlays";

/** Amber ladder — dark → mid → light (Today / D+1 / D+2). */
const MAX_PAIN_TODAY = "#b45309";
const MAX_PAIN_D1 = "#f59e0b";
const MAX_PAIN_D2 = "#fde68a";

export function currentPriceLineColor(
  lastCandle: { open: number; close: number } | null | undefined,
): string {
  const bullish = lastCandle ? lastCandle.close >= lastCandle.open : true;
  return bullish ? LEVELS_ZONE_CHART.bull.line : LEVELS_ZONE_CHART.bear.line;
}

export interface SimZoneSlAnchors {
  bullSl: number | null;
  bearSl: number | null;
}

export function simZoneSlAnchors(suggested: SuggestedZonesSnapshot): SimZoneSlAnchors {
  const { bullSl, bearSl } = computeZoneSlAnchors({
    halfWidthUsd: suggested.halfWidthUsd,
    bullZoneLow: suggested.bullZoneLow,
    bullZoneHigh: suggested.bullZoneHigh,
    bearZoneLow: suggested.bearZoneLow,
    bearZoneHigh: suggested.bearZoneHigh,
  });
  return { bullSl, bearSl };
}

export function resolveMaxPainEntry(
  suggested: SuggestedZonesSnapshot,
  dayIndex: number,
): { maxPain: number; dayIndex: number } | null {
  const days = suggested.maxPainByExpiry ?? [];
  const hit =
    days.find((e) => e.dayIndex === dayIndex) ??
    (days[dayIndex] != null ? days[dayIndex] : null);
  if (!hit || !Number.isFinite(hit.maxPain)) return null;
  return { maxPain: hit.maxPain, dayIndex };
}

/** Match CSS ZonePriceLadder — tight corridor around inv. anchors. */
const STRUCTURE_EDGE_PAD = 0.06;

function collectStructurePrices(
  suggested: SuggestedZonesSnapshot,
  anchors: SimZoneSlAnchors,
  spot: number | null | undefined,
): number[] {
  const out: number[] = [];
  const push = (v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) out.push(v);
  };
  push(anchors.bullSl);
  push(anchors.bearSl);
  push(suggested.bullZoneLow);
  push(suggested.bullZoneHigh);
  push(suggested.bearZoneLow);
  push(suggested.bearZoneHigh);
  push(spot);
  return out;
}

function candleOnlyPriceRange(
  candles: CandlestickData[],
  padRatio = 0.04,
): { minValue: number; maxValue: number; from: number; to: number } | null {
  if (candles.length === 0) return null;
  const prices: number[] = [];
  for (const c of candles) prices.push(c.high, c.low);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max((max - min) * padRatio, max > 100 ? 1 : 0.01);
  return { minValue: min - pad, maxValue: max + pad, from: min - pad, to: max + pad };
}

/**
 * Y-axis: zone structure plus the full loaded candle range (7d), so every bar
 * stays visible. Tight scaleMargins on the chart handle top/bottom breathing room.
 */
export function mergedSimPriceRange(
  candles: CandlestickData[],
  suggested: SuggestedZonesSnapshot | null | undefined,
  spot: number | null | undefined,
): { minValue: number; maxValue: number; from: number; to: number } | null {
  const prices: number[] = [];
  for (const c of candles) prices.push(c.high, c.low);

  if (!suggested) return candleOnlyPriceRange(candles);

  const anchors = simZoneSlAnchors(suggested);
  const structurePrices = collectStructurePrices(suggested, anchors, spot);
  if (structurePrices.length < 2 && prices.length === 0) return null;

  let renderMin = Infinity;
  let renderMax = -Infinity;

  if (structurePrices.length >= 2) {
    const structureMin =
      anchors.bullSl ??
      suggested.bullZoneLow ??
      Math.min(...structurePrices);
    const structureMax =
      anchors.bearSl ??
      suggested.bearZoneHigh ??
      Math.max(...structurePrices);
    const structureSpan = Math.max(
      structureMax - structureMin,
      structureMin > 0 ? structureMin * 0.0005 : 0.01,
    );

    renderMin = structureMin - structureSpan * STRUCTURE_EDGE_PAD;
    renderMax = structureMax + structureSpan * STRUCTURE_EDGE_PAD;

    if (spot != null && Number.isFinite(spot)) {
      const spotPad = structureSpan * 0.035;
      if (spot < renderMin) renderMin = spot - spotPad;
      if (spot > renderMax) renderMax = spot + spotPad;
    }
  }

  if (prices.length > 0) {
    renderMin = Math.min(renderMin, Math.min(...prices));
    renderMax = Math.max(renderMax, Math.max(...prices));
  }

  if (!Number.isFinite(renderMin) || !Number.isFinite(renderMax)) return null;

  const span = Math.max(renderMax - renderMin, renderMax > 100 ? 1 : 0.01);
  const pad = Math.max(span * 0.015, renderMax > 100 ? 0.5 : 0.005);
  const from = renderMin - pad;
  const to = renderMax + pad;
  return { minValue: from, maxValue: to, from, to };
}

export function syncSimZoneBands(
  bearBand: ISeriesApi<"Baseline"> | null,
  bullBand: ISeriesApi<"Baseline"> | null,
  candles: CandlestickData[],
  suggested: SuggestedZonesSnapshot | null | undefined,
  bullStyle: Record<string, unknown>,
  bearStyle: Record<string, unknown>,
): void {
  if (!bullBand || !bearBand) return;

  if (!suggested || candles.length === 0) {
    bullBand.setData([]);
    bearBand.setData([]);
    return;
  }

  const { bullZoneLow, bullZoneHigh, bearZoneLow, bearZoneHigh } = suggested;

  if (bullZoneLow != null && bullZoneHigh != null && bullZoneHigh > bullZoneLow) {
    bullBand.applyOptions({
      ...bullStyle,
      visible: true,
      baseValue: { type: "price", price: bullZoneLow },
    });
    bullBand.setData(bandLineData(candles, bullZoneHigh));
  } else {
    bullBand.setData([]);
    bullBand.applyOptions({ visible: false });
  }

  if (bearZoneLow != null && bearZoneHigh != null && bearZoneHigh > bearZoneLow) {
    bearBand.applyOptions({
      ...bearStyle,
      visible: true,
      baseValue: { type: "price", price: bearZoneLow },
    });
    bearBand.setData(bandLineData(candles, bearZoneHigh));
  } else {
    bearBand.setData([]);
    bearBand.applyOptions({ visible: false });
  }
}

export function applySimPriceLines(
  series: ISeriesApi<"Candlestick">,
  priceLinesRef: { current: IPriceLine[] },
  suggested: SuggestedZonesSnapshot | null | undefined,
  spot: number | null | undefined,
  lastCandle?: { open: number; close: number } | null,
): void {
  for (const line of priceLinesRef.current) series.removePriceLine(line);
  priceLinesRef.current = [];
  if (!suggested) return;

  const anchors = simZoneSlAnchors(suggested);

  const add = (
    price: number | null | undefined,
    color: string,
    title: string,
    style: LineStyle = LineStyle.Dashed,
    width: 1 | 2 | 3 | 4 = 1,
  ) => {
    if (price == null || !Number.isFinite(price)) return;
    priceLinesRef.current.push(
      series.createPriceLine({
        price,
        color,
        lineWidth: width,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      }),
    );
  };

  add(suggested.bearZoneHigh, LEVELS_ZONE_CHART.bear.line, "Resistance H");
  add(suggested.bearZoneLow, LEVELS_ZONE_CHART.bear.line, "Resistance L");
  add(anchors.bearSl, LEVELS_ZONE_CHART.bear.lineInv, "Bear Inv.", LineStyle.Dotted, 2);
  add(suggested.bullZoneHigh, LEVELS_ZONE_CHART.bull.line, "Support H");
  add(suggested.bullZoneLow, LEVELS_ZONE_CHART.bull.line, "Support L");
  add(anchors.bullSl, LEVELS_ZONE_CHART.bull.lineInv, "Bull Inv.", LineStyle.Dotted, 2);

  const mpMeta: { dayIndex: number; label: string; color: string }[] = [
    { dayIndex: 0, label: "Max Pain Today", color: MAX_PAIN_TODAY },
    { dayIndex: 1, label: "Max Pain D+1", color: MAX_PAIN_D1 },
    { dayIndex: 2, label: "Max Pain D+2", color: MAX_PAIN_D2 },
  ];
  for (const { dayIndex, label, color } of mpMeta) {
    const entry = resolveMaxPainEntry(suggested, dayIndex);
    if (entry) add(entry.maxPain, color, label, LineStyle.Dashed, 2);
  }

  const currentPrice =
    spot != null && Number.isFinite(spot)
      ? spot
      : lastCandle?.close != null && Number.isFinite(lastCandle.close)
        ? lastCandle.close
        : null;
  if (currentPrice != null) {
    add(
      currentPrice,
      currentPriceLineColor(lastCandle),
      "Current price",
      LineStyle.Dotted,
      2,
    );
  }
}

export function formatSimBandDetail(
  side: "bull" | "bear",
  suggested: SuggestedZonesSnapshot,
): string {
  const fmt = (p: number): string =>
    p >= 1000
      ? Math.round(p).toLocaleString()
      : p.toLocaleString(undefined, {
          minimumFractionDigits: p < 10 ? 3 : 2,
          maximumFractionDigits: p < 10 ? 3 : 2,
        });

  const fmtHalfWidth = (hw: number): string => {
    if (hw >= 1000) return Math.round(hw).toLocaleString();
    if (hw >= 10) return hw.toFixed(0);
    if (hw >= 1) return hw.toFixed(2);
    return hw.toFixed(3);
  };

  const bits: string[] = [];
  const strike = side === "bull" ? suggested.bullStrike : suggested.bearStrike;
  const oi = side === "bull" ? suggested.bullOI : suggested.bearOI;
  const share = side === "bull" ? suggested.bullClusterShare : suggested.bearClusterShare;
  const tp = side === "bull" ? suggested.bullTpTarget : suggested.bearTpTarget;
  const locked = side === "bull" ? suggested.bullLocked : suggested.bearLocked;
  const halfWidth = suggested.halfWidthUsd;

  if (strike != null) bits.push(`@ ${fmt(strike)}`);
  if (halfWidth != null) bits.push(`HW ${fmtHalfWidth(halfWidth)}`);
  if (oi != null && oi > 0) bits.push(`OI ${Math.round(oi).toLocaleString()}`);
  if (share != null && share > 0) bits.push(`${Math.round(share * 100)}%`);
  if (tp != null) bits.push(`TP ${fmt(tp)}`);
  if (locked) bits.push("LOCKED");
  return bits.join(" · ");
}
