import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FNO, FONT_STACK } from "../theme";
import { Logo } from "../components/Logo";

interface Props {
  variant: "put" | "call";
  dateLabel: string;
  count: number;
}

export const Intro: React.FC<Props> = ({ variant, dateLabel, count }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const titleY = interpolate(frame, [8, 26], [40, 0], { extrapolateRight: "clamp" });
  const titleO = interpolate(frame, [8, 26], [0, 1], { extrapolateRight: "clamp" });
  const subO = interpolate(frame, [22, 38], [0, 1], { extrapolateRight: "clamp" });

  const bullish = variant === "put";
  const headline = bullish ? "PUT walls" : "CALL walls";
  const tone = bullish ? "#22c55e" : "#ef4444";
  const sub = bullish
    ? "Stocks at — or approaching — a massive put wall"
    : "Stocks at — or approaching — a massive call wall";
  const lean = bullish ? "Support · where put writers are defending" : "Resistance · where call writers are capping";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        fontFamily: FONT_STACK,
        padding: 60,
        textAlign: "center",
      }}
    >
      <div style={{ transform: `scale(${pop})` }}>
        <Logo size={108} />
      </div>
      <div style={{ transform: `translateY(${titleY}px)`, opacity: titleO }}>
        <div style={{ color: FNO.subtle, fontSize: 34, fontWeight: 600, letterSpacing: 1 }}>
          TOP {count} · {dateLabel}
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 900,
            lineHeight: 1.02,
            marginTop: 8,
            color: FNO.text,
            letterSpacing: -2,
          }}
        >
          Massive
          <br />
          <span style={{ color: tone }}>{headline}</span>
        </div>
      </div>
      <div style={{ opacity: subO, color: FNO.subtle, fontSize: 36, maxWidth: 860, fontWeight: 500 }}>
        {sub}
      </div>
      <div
        style={{
          opacity: subO,
          color: tone,
          fontSize: 28,
          fontWeight: 700,
          padding: "10px 22px",
          borderRadius: 999,
          background: bullish ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${bullish ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
        }}
      >
        {lean}
      </div>
    </div>
  );
};
