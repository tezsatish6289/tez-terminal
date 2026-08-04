import { ImageResponse } from "next/og";
import { buildSrReplayTitle } from "@/lib/fnoninja/sr-replay-types";
import { loadStoryReplayPayload } from "@/lib/sr-audit/load-story-replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "FNONINJA — Wall story replay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ id: string }> };

export default async function ReplayOGImage({ params }: Props) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw || "").trim();
  let replay = null;
  try {
    replay = id ? await loadStoryReplayPayload(id) : null;
  } catch {
    replay = null;
  }

  const title = replay ? buildSrReplayTitle(replay) : "Wall story replay";
  const setup = replay
    ? replay.side === "support"
      ? "Put-wall bounce"
      : "Call-wall rejection"
    : "Educational recap";
  const headline = replay
    ? `${replay.label || replay.symbol}  +${replay.movePct.toFixed(1)}%`
    : "FNONINJA";
  const setupColor = replay?.side === "support" ? "#4ade80" : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "56px 64px",
          background: "linear-gradient(145deg, #070d1a 0%, #080f1e 45%, #0d1b2e 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 900,
            background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 60%, #93c5fd 100%)",
            backgroundClip: "text",
            color: "transparent",
            letterSpacing: "-1px",
            marginBottom: 28,
          }}
        >
          FNONINJA
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 22,
            fontWeight: 700,
            color: setupColor,
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {setup}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 900,
            color: "#f0f4ff",
            letterSpacing: "-1.5px",
            lineHeight: 1.15,
            maxWidth: 1000,
            marginBottom: 20,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#94a3b8",
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 40,
            justifyContent: "space-between",
            fontSize: 18,
            color: "#64748b",
          }}
        >
          <div style={{ display: "flex" }}>Educational recap — not investment advice</div>
          <div style={{ display: "flex", color: "#93c5fd", fontWeight: 700 }}>fnoninja.com</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
