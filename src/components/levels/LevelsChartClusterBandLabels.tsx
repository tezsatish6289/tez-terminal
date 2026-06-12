"use client";

import { useCallback, useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
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

type LabelPos = { id: string; top: number; text: string; style: React.CSSProperties };

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

export function LevelsChartClusterBandLabels({
  chartRef,
  seriesRef,
  containerRef,
  levels,
  visible,
}: {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  levels: PublicLevels | null | undefined;
  visible: boolean;
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

    const putText = formatClusterPeakLabel("Put", levels.putClusterSize, levels.putClusterStrike);
    if (putText && levels.bullLow != null && levels.bullHigh != null) {
      const center = bandCenterY(series, levels.bullLow, levels.bullHigh);
      if (center != null) {
        next.push({
          id: "put",
          top: clamp(center),
          text: putText,
          style: CLUSTER_LABEL_STYLE,
        });
      }
    }

    if (levels.poc != null) {
      const y = priceY(series, levels.poc);
      if (y != null) {
        const expirySuffix = levels.zonesExpiry ? ` · ${levels.zonesExpiry} Expiry` : "";
        next.push({
          id: "maxPain",
          top: clamp(y),
          text: `Max Pain${expirySuffix}`,
          style: MAX_PAIN_LABEL_STYLE,
        });
      }
    }

    const callText = formatClusterPeakLabel("Call", levels.callClusterSize, levels.callClusterStrike);
    if (callText && levels.bearLow != null && levels.bearHigh != null) {
      const center = bandCenterY(series, levels.bearLow, levels.bearHigh);
      if (center != null) {
        next.push({
          id: "call",
          top: clamp(center),
          text: callText,
          style: CLUSTER_LABEL_STYLE,
        });
      }
    }

    setLabels(next);
  }, [containerRef, levels, seriesRef, visible]);

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
        <BandChartLabel key={label.id} top={label.top} text={label.text} style={label.style} />
      ))}
    </div>
  );
}

function BandChartLabel({
  top,
  text,
  style,
}: {
  top: number;
  text: string;
  style: React.CSSProperties;
}) {
  return (
    <div
      className="absolute left-2 sm:left-3 max-w-[min(85%,18rem)] -translate-y-1/2 rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold leading-snug tracking-tight whitespace-normal"
      style={{ top, ...style }}
    >
      {text}
    </div>
  );
}
