import {
  FNO_BG_CANVAS,
  FNO_BUBBLE_MAP_TEXTURE,
  FNO_BUBBLE_MAP_TEXTURE_SIZE,
} from "@/lib/fnoninja/theme";
import { getBroadcastDailyPlan } from "@/lib/fnoninja/broadcast-daily-plan";

/**
 * Fixed 1280×720 YouTube thumbnail card for the nightly live broadcast. The
 * streamer screenshots this page each night and sets it as the broadcast
 * thumbnail, so the headline (e.g. "WEEKLY WRAP") and date change daily — big
 * bold text + a decorative option-wall bubble snippet, all left-aligned.
 *
 * Rendered server-side at request time so the weekday/date are always current.
 */

/** Static decorative bubbles (instant render — not the physics map). */
const BUBBLES: { x: number; y: number; r: number; label?: string; tone: string }[] = [
  { x: 250, y: 150, r: 120, label: "NIFTY", tone: "rgba(96,165,250,0.18)" },
  { x: 470, y: 250, r: 95, label: "BANK\nNIFTY", tone: "rgba(52,211,153,0.16)" },
  { x: 120, y: 330, r: 78, label: "RELI", tone: "rgba(251,191,36,0.16)" },
  { x: 360, y: 430, r: 70, label: "TCS", tone: "rgba(96,165,250,0.14)" },
  { x: 540, y: 80, r: 52, tone: "rgba(244,114,182,0.14)" },
  { x: 60, y: 150, r: 46, tone: "rgba(167,139,250,0.14)" },
  { x: 520, y: 410, r: 58, tone: "rgba(96,165,250,0.12)" },
  { x: 250, y: 520, r: 50, tone: "rgba(52,211,153,0.12)" },
];

export function BroadcastThumbnail() {
  const plan = getBroadcastDailyPlan();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: 1280,
        height: 720,
        overflow: "hidden",
        backgroundColor: FNO_BG_CANVAS,
        backgroundImage: FNO_BUBBLE_MAP_TEXTURE,
        backgroundSize: FNO_BUBBLE_MAP_TEXTURE_SIZE,
        color: "#f0f4ff",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Decorative option-wall bubble snippet on the right side. */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 640, height: 720, opacity: 0.9 }}>
        {BUBBLES.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.r * 2,
              height: b.r * 2,
              borderRadius: "50%",
              background: b.tone,
              border: "1px solid rgba(120,160,230,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontWeight: 800,
              fontSize: b.r > 80 ? 22 : 15,
              color: "rgba(220,232,255,0.78)",
              whiteSpace: "pre-line",
              lineHeight: 1.05,
            }}
          >
            {b.label}
          </div>
        ))}
        {/* fade the bubbles into the left text column */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, ${FNO_BG_CANVAS} 0%, rgba(7,13,26,0.4) 35%, transparent 70%)`,
          }}
        />
      </div>

      {/* Left text column — logo, headline, subline all on one left margin. */}
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 0,
          bottom: 0,
          width: 720,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fnoninja/icon.svg" alt="FNONINJA" width={64} height={64} style={{ borderRadius: 14 }} />
          <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: "0.01em" }}>
            FNO<span style={{ color: "#60a5fa" }}>NINJA</span>
            <span style={{ color: "#93c5fd" }}>.com</span>
          </span>
        </div>

        {/* Live chip */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            alignSelf: "flex-start",
            padding: "8px 18px",
            borderRadius: 999,
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.45)",
            marginBottom: 26,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#f87171" }} />
          <span style={{ fontSize: 20, fontWeight: 800, color: "#fca5a5", letterSpacing: "0.1em" }}>
            LIVE · 11 PM IST
          </span>
        </div>

        {/* Huge headline */}
        <h1
          style={{
            margin: 0,
            fontSize: 132,
            fontWeight: 900,
            lineHeight: 0.92,
            letterSpacing: "-0.02em",
            color: "#f0f4ff",
            textTransform: "uppercase",
          }}
        >
          {plan.thumbnailTitle.split(" ").map((word, i) => (
            <span key={i} style={{ display: "block", color: i === 0 ? "#f0f4ff" : plan.accent }}>
              {word}
            </span>
          ))}
        </h1>

        {/* Subline */}
        <p
          style={{
            margin: 0,
            marginTop: 30,
            fontSize: 32,
            fontWeight: 700,
            color: "#cbd5e1",
            letterSpacing: "0.005em",
          }}
        >
          Option Walls &amp; Key Levels
          <span style={{ color: plan.accent }}> · {plan.shortDateLabel}</span>
        </p>
      </div>
    </div>
  );
}
