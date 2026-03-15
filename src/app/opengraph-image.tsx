import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TezTerminal — Super Advanced AI Crypto Trading Terminal";
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
          background: "linear-gradient(145deg, #0a0a0c 0%, #0f1114 40%, #0a0a0c 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow effects */}
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "-10%",
            width: "50%",
            height: "60%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(106,173,172,0.12) 0%, transparent 70%)",
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
            background: "radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Radar icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6aadac"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="72"
            height="72"
          >
            <path d="M19.07 4.93A10 10 0 0 1 22 12c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2" />
            <path d="M16.24 7.76A6 6 0 0 1 18 12c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6" />
            <circle cx="12" cy="12" r="2" />
            <line x1="12" y1="12" x2="20" y2="4" />
            <circle cx="20" cy="4" r="1" fill="#6aadac" stroke="none" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: "#6aadac",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            TezTerminal
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "-0.5px",
              textAlign: "center",
              maxWidth: 700,
              lineHeight: 1.3,
            }}
          >
            Super Advanced AI Crypto Trading Terminal
          </div>

          <div
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.4)",
              textAlign: "center",
              maxWidth: 600,
              lineHeight: 1.5,
              marginTop: 8,
            }}
          >
            Scans the global crypto market 24/7 · Filters noise with AI · Delivers high-probability setups
          </div>
        </div>

        {/* Bottom stats bar */}
        <div
          style={{
            display: "flex",
            gap: 48,
            marginTop: 48,
          }}
        >
          {[
            { value: "4", label: "TIMEFRAMES" },
            { value: "24/7", label: "SCANNING" },
            { value: "FREE", label: "TO USE" },
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
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#6aadac",
                  letterSpacing: "-1px",
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.3)",
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
    { ...size }
  );
}
