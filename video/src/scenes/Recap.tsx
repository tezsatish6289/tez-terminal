import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FNO, FONT_STACK, ZONE } from "../theme";
import type { StockSlide, VideoData } from "../schema";
import { formatClusterContracts, formatPrice } from "../lib/format";

interface Props {
  stocks: StockSlide[];
  variant: VideoData["variant"];
}

export const Recap: React.FC<Props> = ({ stocks, variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bullish = variant === "put";
  const tone = bullish ? ZONE.bull : ZONE.bear;
  const toneColor = bullish ? "#22c55e" : "#ef4444";
  const titleO = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT_STACK, padding: "150px 60px 150px", display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ opacity: titleO, textAlign: "center" }}>
        <div style={{ color: FNO.subtle, fontSize: 32, fontWeight: 600 }}>Today's OI snapshot</div>
        <div style={{ color: FNO.text, fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>
          The <span style={{ color: toneColor }}>{bullish ? "put walls" : "call walls"}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>
        {stocks.map((s, i) => {
          const enter = spring({ frame: frame - 8 - i * 6, fps, config: { damping: 16 } });
          const size = formatClusterContracts(bullish ? s.putClusterSize : s.callClusterSize);
          const strike = bullish ? s.putClusterStrike : s.callClusterStrike;
          return (
            <div
              key={s.symbol}
              style={{
                opacity: enter,
                transform: `translateX(${interpolate(enter, [0, 1], [40, 0])}px)`,
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "20px 26px",
                borderRadius: 18,
                background: FNO.card,
                border: `1px solid ${tone.bandBorder}`,
              }}
            >
              <div style={{ color: toneColor, fontSize: 40, fontWeight: 900, width: 44 }}>{i + 1}</div>
              <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ color: FNO.text, fontSize: 44, fontWeight: 800 }}>{s.symbol}</span>
                <span style={{ color: s.zoneState === "IN" ? toneColor : FNO.subtle, fontSize: 24, fontWeight: 700 }}>
                  {s.zoneState === "IN" ? "AT ZONE" : "NEAR"}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: toneColor, fontSize: 36, fontWeight: 800 }}>{size ?? "—"}</div>
                <div style={{ color: FNO.subtle, fontSize: 26 }}>@ ₹{formatPrice(strike)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
