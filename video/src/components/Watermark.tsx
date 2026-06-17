import React from "react";
import { FNO, FONT_STACK } from "../theme";
import { Logo } from "./Logo";

/** Persistent brand watermark — logo + fnoninja.com, present every frame. */
export const Watermark: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: 28,
        right: 30,
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: 0.85,
        fontFamily: FONT_STACK,
      }}
    >
      <Logo size={34} />
      <span style={{ color: FNO.text, fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>
        fnoninja<span style={{ color: FNO.accent }}>.com</span>
      </span>
    </div>
  );
};
