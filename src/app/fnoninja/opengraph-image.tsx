import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "FNONINJA — Option-chain analytics for NSE F&O";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function FnoNinjaOGImage() {
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
          background: "linear-gradient(145deg, #070d1a 0%, #080f1e 45%, #0d1b2e 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-15%",
            left: "-5%",
            width: "45%",
            height: "55%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            right: "-10%",
            width: "50%",
            height: "60%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(96,165,250,0.1) 0%, transparent 70%)",
          }}
        />

        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 60%, #93c5fd 100%)",
            backgroundClip: "text",
            color: "transparent",
            letterSpacing: "-2px",
            lineHeight: 1,
            marginBottom: 20,
          }}
        >
          FNONINJA
        </div>

        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "rgba(240,244,255,0.9)",
            letterSpacing: "-0.5px",
            textAlign: "center",
            maxWidth: 760,
            lineHeight: 1.3,
          }}
        >
          Option-chain analytics for NSE F&amp;O
        </div>

        <div
          style={{
            fontSize: 17,
            color: "rgba(100,116,139,0.95)",
            textAlign: "center",
            maxWidth: 640,
            lineHeight: 1.5,
            marginTop: 16,
          }}
        >
          Market maps · Open-interest clusters · Derived zone observations
        </div>

        <div
          style={{
            display: "flex",
            gap: 40,
            marginTop: 44,
          }}
        >
          {[
            { value: "200+", label: "F&O SYMBOLS" },
            { value: "LIVE", label: "SESSION DATA" },
            { value: "INFO", label: "NOT ADVICE" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: "#60a5fa",
                  letterSpacing: "-1px",
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(100,116,139,0.8)",
                  letterSpacing: "2px",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
