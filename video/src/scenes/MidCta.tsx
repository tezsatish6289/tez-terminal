import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { FNO, FONT_STACK } from "../theme";
import { Logo } from "../components/Logo";

/** Quick mid-roll touchpoint after stock #3 — keeps fnoninja.com top of mind. */
export const MidCta: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 12, 48, 60], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, 14], [0.9, 1], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: FONT_STACK,
        opacity: o,
        transform: `scale(${scale})`,
        textAlign: "center",
        padding: 70,
      }}
    >
      <Logo size={84} />
      <div style={{ color: FNO.text, fontSize: 56, fontWeight: 900, lineHeight: 1.1, maxWidth: 900 }}>
        Live for <span style={{ color: FNO.accent }}>every F&O stock</span>
      </div>
      <div style={{ color: FNO.subtle, fontSize: 38, fontWeight: 600 }}>on fnoninja.com</div>
    </div>
  );
};
