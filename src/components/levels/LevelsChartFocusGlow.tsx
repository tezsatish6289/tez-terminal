"use client";

import { useCallback, useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { LevelVisualFocus } from "@/components/levels/native-chart-level-overlays";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";

type GlowRect = {
  top: number;
  height: number;
  style: React.CSSProperties;
};

function bandRect(
  series: ISeriesApi<"Candlestick">,
  low: number | null | undefined,
  high: number | null | undefined,
  containerHeight: number,
): { top: number; height: number } | null {
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  const yLow = series.priceToCoordinate(low);
  const yHigh = series.priceToCoordinate(high);
  if (yLow == null || yHigh == null) return null;
  const top = Math.min(yLow, yHigh);
  const height = Math.max(Math.abs(yLow - yHigh), 8);
  return {
    top: Math.min(Math.max(top - 4, 0), containerHeight - height - 4),
    height: Math.min(height + 8, containerHeight),
  };
}

function priceRect(
  series: ISeriesApi<"Candlestick">,
  price: number | null | undefined,
  containerHeight: number,
  band = 36,
): { top: number; height: number } | null {
  if (price == null || !Number.isFinite(price)) return null;
  const y = series.priceToCoordinate(price);
  if (y == null) return null;
  const top = Math.max(y - band / 2, 0);
  return {
    top,
    height: Math.min(band, containerHeight - top),
  };
}

export function LevelsChartFocusGlow({
  chartRef,
  seriesRef,
  containerRef,
  levels,
  focus,
  visible,
}: {
  chartRef: React.RefObject<IChartApi | null>;
  seriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  levels: PublicLevels | null | undefined;
  focus: LevelVisualFocus;
  visible: boolean;
}) {
  const [glows, setGlows] = useState<GlowRect[]>([]);

  const updateGlows = useCallback(() => {
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!series || !container || !levels || !visible) {
      setGlows([]);
      return;
    }

    const height = container.clientHeight;
    const next: GlowRect[] = [];

    if (focus === "put") {
      const rect = bandRect(series, levels.bullLow, levels.bullHigh, height);
      if (rect) {
        next.push({
          ...rect,
          style: {
            background: "rgba(34, 197, 94, 0.12)",
            boxShadow:
              "0 0 48px rgba(34,197,94,0.65), 0 0 96px rgba(34,197,94,0.28), inset 0 0 0 2px rgba(74,222,128,0.85)",
          },
        });
      }
    } else if (focus === "call") {
      const rect = bandRect(series, levels.bearLow, levels.bearHigh, height);
      if (rect) {
        next.push({
          ...rect,
          style: {
            background: "rgba(239, 68, 68, 0.12)",
            boxShadow:
              "0 0 48px rgba(239,68,68,0.65), 0 0 96px rgba(239,68,68,0.28), inset 0 0 0 2px rgba(248,113,113,0.85)",
          },
        });
      }
    } else if (focus === "maxPain" && levels.poc != null) {
      const rect = priceRect(series, levels.poc, height, 48);
      if (rect) {
        next.push({
          ...rect,
          style: {
            background: "rgba(251, 191, 36, 0.1)",
            boxShadow:
              "0 0 44px rgba(251,191,36,0.7), 0 0 88px rgba(251,191,36,0.3), inset 0 0 0 2px rgba(251,191,36,0.85)",
          },
        });
      }
    } else if (focus === "expiry") {
      next.push({
        top: 6,
        height: height - 12,
        style: {
          background: "rgba(37, 99, 235, 0.05)",
          boxShadow:
            "inset 0 0 0 2px rgba(96,165,250,0.55), 0 0 40px rgba(37,99,235,0.22)",
        },
      });
    }

    setGlows(next);
  }, [containerRef, focus, levels, seriesRef, visible]);

  useEffect(() => {
    updateGlows();
  }, [updateGlows]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !visible) return;

    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(updateGlows);
    const ro = containerRef.current ? new ResizeObserver(updateGlows) : null;
    if (containerRef.current) ro?.observe(containerRef.current);

    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(updateGlows);
      ro?.disconnect();
    };
  }, [chartRef, containerRef, updateGlows, visible]);

  if (glows.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[12]">
      {glows.map((glow, i) => (
        <div
          key={i}
          className="absolute left-2 right-[5.25rem] md:right-[9.5rem] rounded-md transition-all duration-300"
          style={{ top: glow.top, height: glow.height, ...glow.style }}
        />
      ))}
      {focus === "maxPain" ? (
        <div
          className="absolute left-2 right-[5.25rem] md:right-[9.5rem] pointer-events-none"
          style={{
            top: glows[0]?.top ?? 0,
            height: glows[0]?.height ?? 0,
            borderTop: `2px dashed ${LEVELS_ZONE_CHART.maxPain.line}`,
            opacity: 0.9,
          }}
        />
      ) : null}
    </div>
  );
}
