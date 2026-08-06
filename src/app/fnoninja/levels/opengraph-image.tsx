import { ImageResponse } from "next/og";
import {
  loadBubblesBoard,
  type BubblesBoardSnapshot,
  type BubblesBoardToneKey,
} from "@/lib/fnoninja/bubbles-board";
import { formatMmiValue, MMI_ZONE_META } from "@/lib/fnoninja/mmi";
import { formatBoardAsOf } from "@/lib/fnoninja/today-board-shared";
import { BUBBLE_TONE_STYLE } from "@/lib/zones/bubble-tone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "FNONINJA — Bubbles map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TONE_ORDER: BubblesBoardToneKey[] = ["IN_BULL", "NEAR_BULL", "IN_BEAR", "NEAR_BEAR"];

const TONE_ACCENT: Record<BubblesBoardToneKey, string> = {
  IN_BULL: "#4ade80",
  NEAR_BULL: "#86efac",
  IN_BEAR: "#f87171",
  NEAR_BEAR: "#fca5a5",
};

function CountCard({
  tone,
  count,
  samples,
}: {
  tone: BubblesBoardToneKey;
  count: number;
  samples: string[];
}) {
  const label = BUBBLE_TONE_STYLE[tone].label.toUpperCase();
  const accent = TONE_ACCENT[tone];
  const sample = samples.slice(0, 3).join(" · ") || "—";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "20px 22px",
        borderRadius: 20,
        background: "rgba(13,27,46,0.92)",
        border: `1px solid ${accent}55`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 13,
          fontWeight: 800,
          color: accent,
          letterSpacing: "1px",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 44,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: "-1px",
          lineHeight: 1,
        }}
      >
        {String(count)}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontSize: 16,
          fontWeight: 600,
          color: "#94a3b8",
          overflow: "hidden",
        }}
      >
        {sample}
      </div>
    </div>
  );
}

export default async function LevelsBubblesOGImage() {
  let board: BubblesBoardSnapshot | null = null;
  try {
    board = await loadBubblesBoard();
  } catch {
    /* keep empty fallback for build / cold start */
  }

  const counts = board?.counts ?? {
    all: 0,
    IN_BULL: 0,
    NEAR_BULL: 0,
    IN_BEAR: 0,
    NEAR_BEAR: 0,
    AT_POC: 0,
    UNSCANNED: 0,
  };
  const mmi = board?.mmi ?? null;
  const mmiLabel = mmi
    ? `${formatMmiValue(mmi.value)} · ${MMI_ZONE_META[mmi.zone].label}`
    : "MMI unavailable";
  const mmiColor = mmi ? MMI_ZONE_META[mmi.zone].color : "#64748b";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "44px 48px",
          background: "linear-gradient(145deg, #070d1a 0%, #080f1e 45%, #0d1b2e 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 900,
              background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 60%, #93c5fd 100%)",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "-1px",
            }}
          >
            FNONINJA
          </div>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: "#64748b" }}>
            {`Bubbles map · ${formatBoardAsOf(board?.updatedAt)}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            padding: "18px 24px",
            borderRadius: 18,
            background: "rgba(13,27,46,0.92)",
            border: `1px solid ${mmiColor}66`,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 13,
                fontWeight: 800,
                color: "#94a3b8",
                letterSpacing: "1px",
              }}
            >
              MARKET MOOD INDEX
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 6,
                fontSize: 32,
                fontWeight: 900,
                color: mmiColor,
              }}
            >
              {mmiLabel}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: "#64748b" }}>
            Support & resistance across NSE F&O
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 22,
            flex: 1,
            alignItems: "stretch",
          }}
        >
          {TONE_ORDER.map((tone) => (
            <CountCard
              key={tone}
              tone={tone}
              count={counts[tone]}
              samples={(board?.samples[tone] ?? []).map((s) => s.symbol)}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 18,
            color: "#64748b",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex" }}>Educational map — not investment advice</div>
          <div style={{ display: "flex", color: "#93c5fd", fontWeight: 700 }}>
            fnoninja.com/levels
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
