"use client";

import { useCallback, useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { formatSimBandDetail } from "@/components/simulator/sim-native-chart-overlays";

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

type LabelPos = { id: string; top: number; text: string; style: React.CSSProperties };

const BULL_LABEL_STYLE: React.CSSProperties = {
  color: LEVELS_ZONE_CHART.bull.labelText,
  backgroundColor: "rgba(8, 10, 14, 0.48)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  boxShadow: "0 0 12px rgba(34, 197, 94, 0.15)",
};

const BEAR_LABEL_STYLE: React.CSSProperties = {
  color: LEVELS_ZONE_CHART.bear.labelText,
  backgroundColor: "rgba(8, 10, 14, 0.48)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  boxShadow: "0 0 12px rgba(239, 68, 68, 0.15)",
};

export function SimChartBandLabels({
  chartRef,
  seriesRef,
  containerRef,
  suggested,
  visible,
}: {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  suggested: SuggestedZonesSnapshot | null | undefined;
  visible: boolean;
}) {
  const [labels, setLabels] = useState<LabelPos[]>([]);

  const updatePositions = useCallback(() => {
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!series || !container || !suggested || !visible) {
      setLabels([]);
      return;
    }

    const height = container.clientHeight;
    const clamp = (y: number) => Math.min(Math.max(y, 14), height - 14);
    const next: LabelPos[] = [];

    if (suggested.bullZoneLow != null && suggested.bullZoneHigh != null) {
      const center = bandCenterY(series, suggested.bullZoneLow, suggested.bullZoneHigh);
      if (center != null) {
        const detail = formatSimBandDetail("bull", suggested);
        next.push({
          id: "bull",
          top: clamp(center),
          text: detail ? `Bull zone ${detail}` : "Bull zone",
          style: BULL_LABEL_STYLE,
        });
      }
    }

    if (suggested.bearZoneLow != null && suggested.bearZoneHigh != null) {
      const center = bandCenterY(series, suggested.bearZoneLow, suggested.bearZoneHigh);
      if (center != null) {
        const detail = formatSimBandDetail("bear", suggested);
        next.push({
          id: "bear",
          top: clamp(center),
          text: detail ? `Bear zone ${detail}` : "Bear zone",
          style: BEAR_LABEL_STYLE,
        });
      }
    }

    setLabels(next);
  }, [containerRef, suggested, seriesRef, visible]);

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
        <div
          key={label.id}
          className="absolute left-2 sm:left-3 max-w-[min(85%,18rem)] -translate-y-1/2 rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold leading-snug tracking-tight whitespace-normal"
          style={{ top: label.top, ...label.style }}
        >
          {label.text}
        </div>
      ))}
    </div>
  );
}
