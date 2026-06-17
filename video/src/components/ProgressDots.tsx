import React from "react";
import { FNO } from "../theme";

/** "n of total" segment progress pips, shown during stock slides. */
export const ProgressDots: React.FC<{ total: number; active: number }> = ({ total, active }) => {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === active ? 34 : 12,
            height: 12,
            borderRadius: 6,
            background: i === active ? FNO.accent : "rgba(148,163,184,0.35)",
            transition: "all 0.3s",
          }}
        />
      ))}
    </div>
  );
};
