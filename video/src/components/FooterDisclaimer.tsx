import React from "react";
import { FNO, FONT_STACK } from "../theme";

/** Persistent tiny disclaimer footer — keeps the framing as data sharing, not advice. */
export const FooterDisclaimer: React.FC<{ generatedAtLabel?: string }> = ({ generatedAtLabel }) => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 22,
        left: 0,
        right: 0,
        textAlign: "center",
        color: FNO.muted,
        fontFamily: FONT_STACK,
        letterSpacing: 0.2,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 18 }}>Educational data viz · Not investment advice · NSE OI data</span>
      {generatedAtLabel ? (
        <span style={{ fontSize: 15, opacity: 0.8 }}>
          This video was generated on {generatedAtLabel} IST
        </span>
      ) : null}
    </div>
  );
};
