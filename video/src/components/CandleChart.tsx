import React from "react";
import { ZONE, FNO } from "../theme";
import type { Candle } from "../schema";
import { formatPrice } from "../lib/format";

interface Band {
  low: number | null;
  high: number | null;
}

interface Props {
  candles: Candle[];
  bull: Band;
  bear: Band;
  spot: number;
  maxPain: number | null;
  width: number;
  height: number;
  /** 0..1 — fraction of candles drawn so far (left-to-right reveal). */
  reveal: number;
  /** 0..1 — band fade-in. */
  bandsOpacity: number;
}

const PAD = { top: 28, right: 116, bottom: 24, left: 14 };

export const CandleChart: React.FC<Props> = ({
  candles,
  bull,
  bear,
  spot,
  maxPain,
  width,
  height,
  reveal,
  bandsOpacity,
}) => {
  if (candles.length < 2) return null;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  // Price domain: candles + bands + reference lines, padded 4%.
  const prices: number[] = [];
  for (const c of candles) prices.push(c.high, c.low);
  for (const v of [bull.low, bull.high, bear.low, bear.high, spot, maxPain]) {
    if (v != null && Number.isFinite(v)) prices.push(v);
  }
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const span = max - min || max * 0.02 || 1;
  min -= span * 0.06;
  max += span * 0.06;

  const yFor = (p: number) => PAD.top + (1 - (p - min) / (max - min)) * plotH;
  const n = candles.length;
  const slot = plotW / n;
  const bodyW = Math.max(2, slot * 0.62);
  const xFor = (i: number) => PAD.left + slot * (i + 0.5);

  const shown = Math.max(2, Math.floor(reveal * n));

  const bandRect = (b: Band, fill: string, border: string) => {
    if (b.low == null || b.high == null || b.high <= b.low) return null;
    const yTop = yFor(b.high);
    const yBot = yFor(b.low);
    return (
      <g opacity={bandsOpacity}>
        <rect x={PAD.left} y={yTop} width={plotW} height={Math.max(2, yBot - yTop)} fill={fill} />
        <line x1={PAD.left} y1={yTop} x2={PAD.left + plotW} y2={yTop} stroke={border} strokeWidth={1.5} />
        <line x1={PAD.left} y1={yBot} x2={PAD.left + plotW} y2={yBot} stroke={border} strokeWidth={1.5} />
      </g>
    );
  };

  const refLine = (price: number | null, color: string, label: string, dash: string) => {
    if (price == null || !Number.isFinite(price)) return null;
    const y = yFor(price);
    return (
      <g opacity={bandsOpacity}>
        <line
          x1={PAD.left}
          y1={y}
          x2={PAD.left + plotW}
          y2={y}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={dash}
        />
        <rect x={PAD.left + plotW} y={y - 13} width={PAD.right} height={26} rx={4} fill="rgba(8,15,30,0.85)" />
        <text x={PAD.left + plotW + 8} y={y - 1} fill={color} fontSize={15} fontWeight={700}>
          {label}
        </text>
        <text x={PAD.left + plotW + 8} y={y + 13} fill={FNO.subtle} fontSize={13}>
          {formatPrice(price)}
        </text>
      </g>
    );
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={0} y={0} width={width} height={height} rx={18} fill="rgba(13,27,46,0.55)" stroke={FNO.cardBorder} />

      {bandRect(bull, ZONE.bull.bandFill, ZONE.bull.bandBorder)}
      {bandRect(bear, ZONE.bear.bandFill, ZONE.bear.bandBorder)}
      {refLine(maxPain, ZONE.maxPain.line, "Max pain", "2 5")}
      {refLine(spot, FNO.accent, "Spot", "6 4")}

      {candles.slice(0, shown).map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? ZONE.bull.candleUp : ZONE.bear.candleDown;
        const x = xFor(i);
        const yO = yFor(c.open);
        const yC = yFor(c.close);
        const yH = yFor(c.high);
        const yL = yFor(c.low);
        const bodyTop = Math.min(yO, yC);
        const bodyH = Math.max(1.5, Math.abs(yC - yO));
        return (
          <g key={i}>
            <line x1={x} y1={yH} x2={x} y2={yL} stroke={color} strokeWidth={Math.max(1, bodyW * 0.16)} />
            <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={1} />
          </g>
        );
      })}
    </svg>
  );
};
