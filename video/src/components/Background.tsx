import React from "react";
import { AbsoluteFill } from "remotion";
import { FNO, FNO_SURFACE_BG, FNO_SURFACE_SIZE } from "../theme";

export const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: FNO.bgCanvas }}>
      <AbsoluteFill style={{ backgroundImage: FNO_SURFACE_BG, backgroundSize: FNO_SURFACE_SIZE }} />
      {children}
    </AbsoluteFill>
  );
};
