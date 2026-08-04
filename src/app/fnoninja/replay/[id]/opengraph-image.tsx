import { ImageResponse } from "next/og";
import { buildSrReplayTitle } from "@/lib/fnoninja/sr-replay-types";
import { loadStoryReplayPayload } from "@/lib/sr-audit/load-story-replay";

export const runtime = "nodejs";
export const alt = "FNONINJA — Wall story replay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export default async function ReplayOGImage({ params }: Props) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw || "").trim();
  const replay = id ? await loadStoryReplayPayload(id) : null;

  const title = replay
    ? buildSrReplayTitle(replay)
    : "Wall story replay";
  const setup = replay
    ? replay.side === "support"
      ? "Put-wall bounce"
      : "Call-wall rejection"
    : "Educational recap";
  const move = replay ? `+${replay.movePct.toFixed(1)}%` : "";
  const symbol = replay?.label || replay?.symbol || "FNONINJA";

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
            fontSize: 22,
            fontWeight: 700,
            color: replay?.side === "support" ? "#4ade80" : "#f87171",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {setup}
        </div>

        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "#f0f4ff",
            letterSpacing: "-1.5px",
            lineHeight: 1.15,
            maxWidth: 1000,
            marginBottom: 20,
          }}
        >
          {symbol}
          {move ? `  ${move}` : ""}
        </div>

        <div style={{ fontSize: 24, color: "#94a3b8", maxWidth: 900, lineHeight: 1.35 }}>
          {title}
        </div>

        <div
          style={{
            marginTop: 40,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 18,
            color: "#64748b",
          }}
        >
          <span>Educational recap — not investment advice</span>
          <span style={{ color: "#93c5fd", fontWeight: 700 }}>fnoninja.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
