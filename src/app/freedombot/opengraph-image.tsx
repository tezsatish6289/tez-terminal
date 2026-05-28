import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "FreedomBot.ai — Trade with full transparency and control";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function FreedomBotOGImage() {
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
          background: "linear-gradient(145deg, #060d1a 0%, #0c1a30 45%, #0a1628 100%)",
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
            width: "55%",
            height: "65%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            right: "-5%",
            width: "50%",
            height: "60%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(96,165,250,0.1) 0%, transparent 70%)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            padding: "0 48px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 900,
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#f0f4ff" }}>FreedomBot</span>
            <span style={{ color: "#60a5fa" }}>.ai</span>
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "rgba(255,255,255,0.9)",
              letterSpacing: "-0.5px",
              textAlign: "center",
              maxWidth: 820,
              lineHeight: 1.25,
            }}
          >
            Trade with full transparency and control
          </div>

          <div
            style={{
              fontSize: 18,
              color: "rgba(148,163,184,0.95)",
              textAlign: "center",
              maxWidth: 720,
              lineHeight: 1.45,
              marginTop: 4,
            }}
          >
            Every trade recorded on-chain · Deploy on Bybit in minutes · No upfront fees
          </div>
        </div>

        <div style={{ display: "flex", gap: 56, marginTop: 52 }}>
          {[
            { value: "ON-CHAIN", label: "RECORDS" },
            { value: "5 MIN", label: "TO DEPLOY" },
            { value: "YOU", label: "OWN THE KEYS" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: "#60a5fa",
                  letterSpacing: "1px",
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(148,163,184,0.7)",
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
