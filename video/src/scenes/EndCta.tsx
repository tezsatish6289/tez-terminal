import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FNO, FONT_STACK } from "../theme";
import { Logo } from "../components/Logo";

/** Strong closing card: "For more information, visit fnoninja.com" + disclaimer. */
export const EndCta: React.FC<{ generatedAtLabel?: string }> = ({ generatedAtLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const lineO = interpolate(frame, [12, 30], [0, 1], { extrapolateRight: "clamp" });
  const btnPop = spring({ frame: frame - 26, fps, config: { damping: 11, mass: 0.5 } });
  const discO = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        fontFamily: FONT_STACK,
        padding: 64,
        textAlign: "center",
      }}
    >
      <div style={{ transform: `scale(${pop})` }}>
        <Logo size={120} />
      </div>
      <div style={{ opacity: lineO, color: FNO.text, fontSize: 66, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, maxWidth: 920 }}>
        For more information,
        <br />
        visit <span style={{ color: FNO.accent }}>fnoninja.com</span>
      </div>
      <div style={{ opacity: lineO, color: FNO.subtle, fontSize: 36, fontWeight: 500, maxWidth: 820 }}>
        Live options zones for every F&O stock — updated daily
      </div>
      <div
        style={{
          transform: `scale(${btnPop})`,
          marginTop: 8,
          padding: "22px 56px",
          borderRadius: 999,
          background: FNO.ctaGradient,
          boxShadow: FNO.ctaShadow,
          color: "#fff",
          fontSize: 44,
          fontWeight: 900,
          letterSpacing: 0.3,
        }}
      >
        fnoninja.com
      </div>
      <div style={{ opacity: lineO, color: FNO.muted, fontSize: 28, fontWeight: 600 }}>
        Link in bio
      </div>

      <div
        style={{
          opacity: discO,
          position: "absolute",
          bottom: 70,
          left: 56,
          right: 56,
          color: FNO.muted,
          fontSize: 22,
          lineHeight: 1.4,
        }}
      >
        Not investment advice. Automated, educational visualisation of publicly available NSE options
        open-interest data. Options data changes intraday and can be wrong or delayed. Do your own
        research / consult a SEBI-registered advisor before acting.
        {generatedAtLabel ? (
          <span style={{ display: "block", marginTop: 10, opacity: 0.85 }}>
            This video was generated on {generatedAtLabel} IST
          </span>
        ) : null}
      </div>
    </div>
  );
};
