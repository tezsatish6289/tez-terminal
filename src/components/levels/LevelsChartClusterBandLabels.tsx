"use client";

import { useCallback, useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelVisualFocus } from "@/components/levels/native-chart-level-overlays";
import { priceLevelKey } from "@/components/levels/native-chart-level-overlays";
import { formatClusterPeakLabel } from "@/lib/levels/format-cluster-size";
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

type LabelPos = { id: string; top: number; text: string; style: React.CSSProperties; zIndex: number };

const MIN_LABEL_GAP = 26;

const LABEL_Z_INDEX: Record<string, number> = {
  maxPain: 10,
  "put-maxPain": 11,
  "call-maxPain": 11,
  put: 20,
  call: 20,
};

function isClusterLabel(id: string): boolean {
  return id === "put" || id === "call";
}

function isMaxPainLabel(id: string): boolean {
  return id === "maxPain" || id === "put-maxPain" || id === "call-maxPain";
}

/** Keep put/call pills readable when max pain sits on the same price band. */
function resolveLabelCollisions(labels: LabelPos[], height: number): LabelPos[] {
  const clamp = (y: number) => Math.min(Math.max(y, 14), height - 14);
  const result = labels.map((l) => ({ ...l }));

  for (const mp of result.filter((l) => isMaxPainLabel(l.id))) {
    for (const cluster of result.filter((l) => isClusterLabel(l.id))) {
      const delta = mp.top - cluster.top;
      if (Math.abs(delta) >= MIN_LABEL_GAP) continue;
      mp.top = delta <= 0 ? cluster.top - MIN_LABEL_GAP : cluster.top + MIN_LABEL_GAP;
      mp.top = clamp(mp.top);
    }
  }

  return result.sort((a, b) => a.zIndex - b.zIndex);
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

export function LevelsChartClusterBandLabels({
  chartRef,
  seriesRef,
  containerRef,
  levels,
  visible,
  visualFocus,
}: {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  levels: PublicLevels | null | undefined;
  visible: boolean;
  visualFocus?: LevelVisualFocus | null;
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
    const clamp = (y: number) => Math.min(Math.max(y, 14), height - 14);
    const next: LabelPos[] = [];

    const putText = formatClusterPeakLabel(
      "Put",
      levels.putClusterSize,
      levels.putClusterStrike,
      levels.putClusterChange,
    );
    const callText = formatClusterPeakLabel(
      "Call",
      levels.callClusterSize,
      levels.callClusterStrike,
      levels.callClusterChange,
    );
    const expirySuffix = levels.zonesExpiry ? ` · ${levels.zonesExpiry} Expiry` : "";

    const pocKey = levels.poc != null ? priceLevelKey(levels.poc) : null;
    const putAtPoc =
      pocKey != null &&
      levels.putClusterStrike != null &&
      priceLevelKey(levels.putClusterStrike) === pocKey;
    const callAtPoc =
      pocKey != null &&
      levels.callClusterStrike != null &&
      priceLevelKey(levels.callClusterStrike) === pocKey;

    if (putAtPoc && levels.poc != null && putText) {
      const y = priceY(series, levels.poc);
      if (y != null) {
        const focused = labelFocused("put", visualFocus) || labelFocused("maxPain", visualFocus);
        next.push({
          id: "put-maxPain",
          top: clamp(y),
          zIndex: LABEL_Z_INDEX["put-maxPain"],
          text: `${putText} · Max Pain${expirySuffix}`,
          style: {
            ...MAX_PAIN_LABEL_STYLE,
            opacity: focused ? 1 : 0.72,
            boxShadow: focused
              ? "0 0 24px rgba(251,191,36,0.35), 0 0 16px rgba(34,197,94,0.25)"
              : MAX_PAIN_LABEL_STYLE.boxShadow,
            border: focused ? "1px solid rgba(251,191,36,0.45)" : "1px solid transparent",
          },
        });
      }
    } else {
      if (putText && levels.bullLow != null && levels.bullHigh != null) {
        const center = bandCenterY(series, levels.bullLow, levels.bullHigh);
        if (center != null) {
          const focused = labelFocused("put", visualFocus);
          next.push({
            id: "put",
            top: clamp(center),
            zIndex: LABEL_Z_INDEX.put,
            text: putText,
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

      if (levels.poc != null && !callAtPoc) {
        const y = priceY(series, levels.poc);
        if (y != null) {
          const focused = labelFocused("maxPain", visualFocus);
          next.push({
            id: "maxPain",
            top: clamp(y),
            zIndex: LABEL_Z_INDEX.maxPain,
            text: `Max Pain${expirySuffix}`,
            style: {
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
    }

    if (callAtPoc && levels.poc != null && callText) {
      const y = priceY(series, levels.poc);
      if (y != null) {
        const existing = next.find((l) => l.id === "put-maxPain");
        if (existing) {
          existing.text = `${existing.text} · ${callText}`;
        } else {
          const focused = labelFocused("call", visualFocus) || labelFocused("maxPain", visualFocus);
          next.push({
            id: "call-maxPain",
            top: clamp(y),
            zIndex: LABEL_Z_INDEX["call-maxPain"],
            text: `${callText} · Max Pain${expirySuffix}`,
            style: {
              ...MAX_PAIN_LABEL_STYLE,
              opacity: focused ? 1 : 0.72,
              boxShadow: focused
                ? "0 0 24px rgba(251,191,36,0.35), 0 0 16px rgba(239,68,68,0.25)"
                : MAX_PAIN_LABEL_STYLE.boxShadow,
              border: focused ? "1px solid rgba(251,191,36,0.45)" : "1px solid transparent",
            },
          });
        }
      }
    } else if (callText && levels.bearLow != null && levels.bearHigh != null) {
      const center = bandCenterY(series, levels.bearLow, levels.bearHigh);
      if (center != null) {
        const focused = labelFocused("call", visualFocus);
        next.push({
          id: "call",
          top: clamp(center),
          zIndex: LABEL_Z_INDEX.call,
          text: callText,
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
  }, [containerRef, levels, seriesRef, visible, visualFocus]);

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
          style={label.style}
          zIndex={label.zIndex}
        />
      ))}
    </div>
  );
}

function BandChartLabel({
  top,
  text,
  style,
  zIndex,
}: {
  top: number;
  text: string;
  style: React.CSSProperties;
  zIndex: number;
}) {
  return (
    <div
      className="absolute left-1.5 sm:left-3 max-w-[min(72%,14rem)] max-md:max-w-[min(68%,11rem)] -translate-y-1/2 rounded-md px-1.5 py-0.5 max-md:px-1.5 max-md:py-0.5 text-[9px] sm:text-[11px] font-bold leading-snug tracking-tight whitespace-normal"
      style={{ top, zIndex, ...style }}
    >
      {text}
    </div>
  );
}
