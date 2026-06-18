import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TezTerminal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#0a0a0c",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "-1px",
          }}
        >
          TezTerminal
        </div>
      </div>
    ),
    { ...size },
  );
}
