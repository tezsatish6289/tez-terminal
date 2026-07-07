"use client";

import { useCallback, useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelVisualFocus } from "@/components/levels/native-chart-level-overlays";
import { formatClusterPeakLabelParts } from "@/lib/levels/format-cluster-size";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

function bandCenterY(
  series: ISeriesApi<"Candlestick">,
  low: number | null | undefined,
  high: number | null | undefined,
): number | null {
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  const yLow = series.priceToCoordinate(low);
  const yHigh = series.priceToCoordinate(high);
  if (yLow == null || yHigh == null) return null;
  return (yLow + yHigh) / 2;
}

function priceY(series: ISeriesApi<"Candlestick">, price: number | null | undefined): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return series.priceToCoordinate(price);
}

type LabelPos = {
  id: string;
  top: number;
  text: string;
  delta?: string | null;
  subtitle?: string | null;
  textOnly?: boolean;
  style: React.CSSProperties;
  zIndex: number;
};

const MIN_LABEL_GAP = 8;

const LABEL_Z_INDEX: Record<string, number> = {
  maxPain: 5,
  put: 25,
  call: 25,
};

function isMaxPainLabel(id: string): boolean {
  return id === "maxPain";
}

function labelHeight(label: LabelPos): number {
  if (label.textOnly) return 16;
  return label.subtitle ? 38 : 26;
}

function clampTop(y: number, chartHeight: number, heightPx: number): number {
  const half = heightPx / 2;
  return Math.min(Math.max(y, half + 6), chartHeight - half - 6);
}

/** Prefer shifting Max Pain so Support/Resistance pills stay on their bands. */
function resolveLabelCollisions(labels: LabelPos[], height: number): LabelPos[] {
  const result = labels.map((l) => ({ ...l }));

  const overlapGap = (a: LabelPos, b: LabelPos) =>
    (labelHeight(a) + labelHeight(b)) / 2 + MIN_LABEL_GAP;

  const overlaps = (a: LabelPos, b: LabelPos) => Math.abs(a.top - b.top) < overlapGap(a, b);

  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]!;
        const b = result[j]!;
        if (!overlaps(a, b)) continue;

        const pushTarget =
          isMaxPainLabel(a.id) ? a : isMaxPainLabel(b.id) ? b : b.zIndex <= a.zIndex ? a : b;
        const anchor = pushTarget === a ? b : a;
        const gap = overlapGap(a, b);
        const newTop =
          pushTarget.top <= anchor.top ? anchor.top - gap : anchor.top + gap;
        pushTarget.top = clampTop(newTop, height, labelHeight(pushTarget));
        moved = true;
      }
    }
    if (!moved) break;
  }

  return result;
}

const CLUSTER_LABEL_STYLE: React.CSSProperties = {
  color: FNO_ACCENT,
  backgroundColor: "rgba(8, 15, 30, 0.42)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  boxShadow: "0 0 12px rgba(8, 15, 30, 0.5)",
};

const MAX_PAIN_LABEL_STYLE: React.CSSProperties = {
  color: LEVELS_ZONE_CHART.maxPain.labelText,
  backgroundColor: "rgba(8, 15, 30, 0.48)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  boxShadow: "0 0 14px rgba(251, 191, 36, 0.12)",
};

function labelFocused(id: string, focus: LevelVisualFocus | null | undefined): boolean {
  if (!focus || focus === "expiry") return true;
  if (focus === "put") return id === "put";
  if (focus === "call") return id === "call";
  return id === "maxPain";
}

function formatExpiryShort(expiry: string | null | undefined): string | null {
  if (!expiry?.trim()) return null;
  const parts = expiry.trim().split("/");
  if (parts.length !== 3) return `${expiry} expiry`;
  const day = Number.parseInt(parts[0]!, 10);
  const month = Number.parseInt(parts[1]!, 10);
  const year = Number.parseInt(parts[2]!, 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return `${expiry} expiry`;
  }
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-IN", {
    month: "short",
    timeZone: "UTC",
  });
  return `${day} ${monthName} expiry`;
}

const MAX_PAIN_TEXT_ONLY_STYLE: React.CSSProperties = {
  color: LEVELS_ZONE_CHART.maxPain.labelText,
  textShadow: "0 0 6px rgba(8, 15, 30, 0.85), 0 1px 2px rgba(0, 0, 0, 0.6)",
};

export function LevelsChartClusterBandLabels({
  chartRef,
  seriesRef,
  containerRef,
  levels,
  visible,
  visualFocus,
  showZoneRole = false,
  compactMaxPainLabel = false,
}: {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  levels: PublicLevels | null | undefined;
  visible: boolean;
  visualFocus?: LevelVisualFocus | null;
  /** Trend chart: prefix Support / Resistance so OI pills are not lost inside Max Pain copy. */
  showZoneRole?: boolean;
  /** Intraday: text-only Max Pain tag (line stays on chart; avoids pill overlap). */
  compactMaxPainLabel?: boolean;
}) {
  const [labels, setLabels] = useState<LabelPos[]>([]);

  const updatePositions = useCallback(() => {
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!series || !container || !levels || !visible) {
      setLabels([]);
      return;
    }

    const height = container.clientHeight;
    const next: LabelPos[] = [];

    const putParts = formatClusterPeakLabelParts(
      "Put",
      levels.putClusterSize,
      levels.putClusterStrike,
      levels.putClusterChange,
    );
    const callParts = formatClusterPeakLabelParts(
      "Call",
      levels.callClusterSize,
      levels.callClusterStrike,
      levels.callClusterChange,
    );
    const maxPainSubtitle = formatExpiryShort(levels.zonesExpiry);

    if (putParts && levels.bullLow != null && levels.bullHigh != null) {
      const center = bandCenterY(series, levels.bullLow, levels.bullHigh);
      if (center != null) {
        const focused = labelFocused("put", visualFocus);
        const rolePrefix = showZoneRole ? "Support · " : "";
        next.push({
          id: "put",
          top: clampTop(center, height, 26),
          zIndex: LABEL_Z_INDEX.put,
          text: `${rolePrefix}${putParts.main}`,
          delta: putParts.delta,
          style: {
            ...CLUSTER_LABEL_STYLE,
            opacity: focused ? 1 : 0.72,
            boxShadow: focused
              ? "0 0 20px rgba(34,197,94,0.35), 0 0 12px rgba(8,15,30,0.5)"
              : CLUSTER_LABEL_STYLE.boxShadow,
            border: focused ? `1px solid ${LEVELS_ZONE_CHART.bull.bandBorder}` : "1px solid transparent",
          },
        });
      }
    }

    if (levels.poc != null) {
      const y = priceY(series, levels.poc);
      if (y != null) {
        const focused = labelFocused("maxPain", visualFocus);
        const textOnly = compactMaxPainLabel;
        const labelHeightPx = textOnly ? 16 : maxPainSubtitle ? 38 : 26;
        next.push({
          id: "maxPain",
          top: clampTop(y, height, labelHeightPx),
          zIndex: LABEL_Z_INDEX.maxPain,
          text: textOnly && maxPainSubtitle ? `Max Pain · ${maxPainSubtitle}` : "Max Pain",
          subtitle: textOnly ? null : maxPainSubtitle,
          textOnly,
          style: textOnly
            ? {
                ...MAX_PAIN_TEXT_ONLY_STYLE,
                opacity: focused ? 1 : 0.82,
              }
            : {
                ...MAX_PAIN_LABEL_STYLE,
                opacity: focused ? 1 : 0.72,
                boxShadow: focused
                  ? "0 0 24px rgba(251,191,36,0.4), 0 0 12px rgba(8,15,30,0.5)"
                  : MAX_PAIN_LABEL_STYLE.boxShadow,
                border: focused ? "1px solid rgba(251,191,36,0.5)" : "1px solid transparent",
              },
        });
      }
    }

    if (callParts && levels.bearLow != null && levels.bearHigh != null) {
      const center = bandCenterY(series, levels.bearLow, levels.bearHigh);
      if (center != null) {
        const focused = labelFocused("call", visualFocus);
        const rolePrefix = showZoneRole ? "Resistance · " : "";
        next.push({
          id: "call",
          top: clampTop(center, height, 26),
          zIndex: LABEL_Z_INDEX.call,
          text: `${rolePrefix}${callParts.main}`,
          delta: callParts.delta,
          style: {
            ...CLUSTER_LABEL_STYLE,
            opacity: focused ? 1 : 0.72,
            boxShadow: focused
              ? "0 0 20px rgba(239,68,68,0.35), 0 0 12px rgba(8,15,30,0.5)"
              : CLUSTER_LABEL_STYLE.boxShadow,
            border: focused ? `1px solid ${LEVELS_ZONE_CHART.bear.bandBorder}` : "1px solid transparent",
          },
        });
      }
    }

    setLabels(resolveLabelCollisions(next, height));
  }, [compactMaxPainLabel, containerRef, levels, seriesRef, showZoneRole, visible, visualFocus]);

  useEffect(() => {
    updatePositions();
  }, [updatePositions]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !visible) return;

    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(updatePositions);
    const ro = containerRef.current ? new ResizeObserver(updatePositions) : null;
    if (containerRef.current) ro?.observe(containerRef.current);

    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(updatePositions);
      ro?.disconnect();
    };
  }, [chartRef, containerRef, updatePositions, visible]);

  if (labels.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]">
      {labels.map((label) => (
        <BandChartLabel
          key={label.id}
          top={label.top}
          text={label.text}
          delta={label.delta}
          subtitle={label.subtitle}
          textOnly={label.textOnly}
          style={label.style}
          zIndex={label.zIndex}
        />
      ))}
    </div>
  );
}

function deltaTone(delta: string): string {
  if (delta.startsWith("▲")) return "rgba(74, 222, 128, 0.9)";
  if (delta.startsWith("▼")) return "rgba(248, 113, 113, 0.9)";
  return "rgba(148, 163, 184, 0.85)";
}

function BandChartLabel({
  top,
  text,
  delta,
  subtitle,
  textOnly = false,
  style,
  zIndex,
}: {
  top: number;
  text: string;
  delta?: string | null;
  subtitle?: string | null;
  textOnly?: boolean;
  style: React.CSSProperties;
  zIndex: number;
}) {
  if (textOnly) {
    return (
      <div
        className="absolute left-1.5 sm:left-3 max-w-[min(72%,13rem)] -translate-y-1/2 text-[8px] sm:text-[9px] font-semibold leading-none tracking-tight whitespace-nowrap"
        style={{ top, zIndex, ...style }}
      >
        {text}
      </div>
    );
  }

  return (
    <div
      className="absolute left-1.5 sm:left-3 max-w-[min(68%,12rem)] max-md:max-w-[min(64%,10rem)] -translate-y-1/2 rounded-md px-1.5 py-0.5 max-md:px-1.5 max-md:py-0.5 text-[9px] sm:text-[10px] font-bold leading-snug tracking-tight whitespace-normal"
      style={{ top, zIndex, ...style }}
    >
      <span>
        {text}
        {delta ? (
          <span
            className="ml-1 align-baseline text-[7px] sm:text-[8px] font-semibold leading-none"
            style={{ color: deltaTone(delta) }}
          >
            {delta}
          </span>
        ) : null}
      </span>
      {subtitle ? (
        <span
          className="mt-0.5 block text-[8px] sm:text-[9px] font-semibold leading-tight"
          style={{ color: "rgba(251, 191, 36, 0.72)" }}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
