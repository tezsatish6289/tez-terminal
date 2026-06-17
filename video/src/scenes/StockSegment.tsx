import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FNO, FONT_STACK, ZONE } from "../theme";
import type { StockSlide, VideoData } from "../schema";
import { CandleChart } from "../components/CandleChart";
import { ProgressDots } from "../components/ProgressDots";
import { formatClusterContracts, formatPrice, pctFromSpot } from "../lib/format";

interface Props {
  slide: StockSlide;
  rank: number;
  total: number;
  variant: VideoData["variant"];
}

const Row: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid rgba(90,140,220,0.12)" }}>
    <span style={{ color: FNO.subtle, fontSize: 30, fontWeight: 500 }}>{label}</span>
    <span style={{ color: accent ?? FNO.text, fontSize: 34, fontWeight: 800 }}>{value}</span>
  </div>
);

export const StockSegment: React.FC<Props> = ({ slide, rank, total, variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.7 } });
  const headerX = interpolate(enter, [0, 1], [-60, 0]);
  const reveal = interpolate(frame, [10, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bands = interpolate(frame, [55, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardO = interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const bullish = variant === "put";
  const inZone = slide.zoneState === "IN";
  const tone = bullish ? ZONE.bull : ZONE.bear;
  const clusterSize = bullish ? slide.putClusterSize : slide.callClusterSize;
  const clusterStrike = bullish ? slide.putClusterStrike : slide.callClusterStrike;
  const sideLabel = bullish ? "Put OI peak" : "Call OI peak";
  const wall = bullish ? "support" : "resistance";
  const wallType = inZone ? `At ${wall}` : `Approaching ${wall}`;
  const toneColor = bullish ? "#22c55e" : "#ef4444";

  const sizeText = formatClusterContracts(clusterSize);
  const distance = pctFromSpot(slide.spot, clusterStrike);

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT_STACK, padding: "150px 56px 150px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
      {/* Header: rank + symbol + spot */}
      <div style={{ display: "flex", alignItems: "center", gap: 22, transform: `translateX(${headerX}px)`, opacity: enter }}>
        <div
          style={{
            width: 74,
            height: 74,
            borderRadius: 18,
            background: tone.badgeBg,
            border: `1px solid ${tone.bandBorder}`,
            color: toneColor,
            fontSize: 44,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {rank}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: FNO.text, fontSize: 60, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>{slide.symbol}</div>
          <div style={{ color: FNO.subtle, fontSize: 30, fontWeight: 600, marginTop: 4 }}>
            Spot ₹{formatPrice(slide.spot)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: toneColor, fontSize: 26, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{wallType}</div>
          {distance ? (
            <div style={{ color: FNO.subtle, fontSize: 28, fontWeight: 600 }}>{distance} away</div>
          ) : null}
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginTop: 26 }}>
        <CandleChart
          candles={slide.candles}
          bull={{ low: slide.bullLow, high: slide.bullHigh }}
          bear={{ low: slide.bearLow, high: slide.bearHigh }}
          spot={slide.spot}
          maxPain={slide.maxPain}
          width={968}
          height={760}
          reveal={reveal}
          bandsOpacity={bands}
        />
      </div>

      {/* Cluster callout + data rows */}
      <div style={{ opacity: cardO, marginTop: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "16px 22px",
            borderRadius: 16,
            background: tone.badgeBg,
            border: `1px solid ${tone.bandBorder}`,
          }}
        >
          <div style={{ color: toneColor, fontSize: 38, fontWeight: 900 }}>
            {sideLabel} — {sizeText ?? "—"}
          </div>
          {clusterStrike != null ? (
            <div style={{ color: FNO.subtle, fontSize: 32, fontWeight: 600 }}>@ ₹{formatPrice(clusterStrike)}</div>
          ) : null}
        </div>

        {!inZone ? (
          <div style={{ marginTop: 12, color: toneColor, fontSize: 28, fontWeight: 600 }}>
            Not there yet — watch for the reaction if it reaches the {wall}.
          </div>
        ) : null}

        <div style={{ marginTop: 14, padding: "4px 8px" }}>
          <Row label="Max pain" value={`₹${formatPrice(slide.maxPain)}`} accent={ZONE.maxPain.label} />
          <Row label="ATM IV" value={slide.atmIV != null ? `${slide.atmIV.toFixed(1)}%` : "—"} />
          {slide.contextTag ? <Row label="Context" value={slide.contextTag} accent={FNO.accent} /> : null}
        </div>
      </div>

      {/* Progress */}
      <div style={{ position: "absolute", bottom: 70, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <ProgressDots total={total} active={rank - 1} />
      </div>
    </div>
  );
};
