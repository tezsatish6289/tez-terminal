import { ImageResponse } from "next/og";
import {
  formatBoardAsOf,
  formatBoardPrice,
  loadTodayBoard,
  type TodayIndexBoard,
} from "@/lib/fnoninja/today-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "FNONINJA — Levels today";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: 1,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 14,
          fontWeight: 800,
          color,
          letterSpacing: "1px",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 40,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: "-1px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ row }: { row: TodayIndexBoard }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "28px 32px",
        borderRadius: 24,
        background: "rgba(13,27,46,0.92)",
        border: "1px solid rgba(96,165,250,0.28)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 900,
            color: "#f0f4ff",
            letterSpacing: "-1px",
          }}
        >
          {row.label}
        </div>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#94a3b8" }}>
          {`Spot ${formatBoardPrice(row.spot)}`}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <Metric label="PUT WALL" value={formatBoardPrice(row.putWall)} color="#4ade80" />
        <Metric label="MAX PAIN" value={formatBoardPrice(row.maxPain)} color="#fbbf24" />
        <Metric label="CALL WALL" value={formatBoardPrice(row.callWall)} color="#f87171" />
      </div>
    </div>
  );
}

const EMPTY_ROWS: TodayIndexBoard[] = [
  {
    symbol: "NIFTY",
    label: "Nifty",
    spot: null,
    putWall: null,
    callWall: null,
    maxPain: null,
    putOi: null,
    callOi: null,
    expiry: null,
    computedAt: null,
  },
  {
    symbol: "BANKNIFTY",
    label: "Bank Nifty",
    spot: null,
    putWall: null,
    callWall: null,
    maxPain: null,
    putOi: null,
    callOi: null,
    expiry: null,
    computedAt: null,
  },
];

export default async function TodayOGImage() {
  let indices: TodayIndexBoard[] = EMPTY_ROWS;
  let updatedAt: string | null = null;
  try {
    const board = await loadTodayBoard();
    if (board.indices.length > 0) indices = board.indices;
    updatedAt = board.updatedAt;
  } catch {
    /* keep empty fallback for build / cold start */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "48px 52px",
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
              fontSize: 42,
              fontWeight: 900,
              background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 60%, #93c5fd 100%)",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "-1px",
            }}
          >
            FNONINJA
          </div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#64748b" }}>
            {`Levels today · ${formatBoardAsOf(updatedAt)}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 36,
            flex: 1,
            alignItems: "stretch",
          }}
        >
          {indices.map((row) => (
            <Row key={row.symbol} row={row} />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 18,
            color: "#64748b",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex" }}>Educational board — not investment advice</div>
          <div style={{ display: "flex", color: "#93c5fd", fontWeight: 700 }}>
            fnoninja.com/today
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
