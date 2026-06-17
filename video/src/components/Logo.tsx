import React from "react";
import { FNO } from "../theme";

/** FNONINJA shuriken mark — mirrors public/fnoninja/icon.svg. */
export const Logo: React.FC<{ size?: number }> = ({ size = 32 }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill={FNO.logoMark} />
      <rect
        x="11.8"
        y="11.8"
        width="8.4"
        height="8.4"
        rx="0.56"
        transform="rotate(45 16 16)"
        fill={FNO.bg}
      />
    </svg>
  );
};
