import { ImageResponse } from "next/og";
import {
  formatBoardAsOf,
  formatBoardPrice,
  loadTodayBoard,
  type TodayIndexBoard,
} from "@/lib/fnoninja/today-board";

export const runtime = "nodejs";
export const alt = "FNONINJA — Levels today";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 60;

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
        <div style={{ fontSize: 36, fontWeight: 900, color: "#f0f4ff", letterSpacing: "-1px" }}>
          {row.label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#94a3b8" }}>
          Spot {formatBoardPrice(row.spot)}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#4ade80",
              letterSpacing: "1px",
              marginBottom: 6,
            }}
          >
            PUT WALL
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>
            {formatBoardPrice(row.putWall)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#fbbf24",
              letterSpacing: "1px",
              marginBottom: 6,
            }}
          >
            MAX PAIN
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>
            {formatBoardPrice(row.maxPain)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#f87171",
              letterSpacing: "1px",
              marginBottom: 6,
            }}
          >
            CALL WALL
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>
            {formatBoardPrice(row.callWall)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function TodayOGImage() {
  let indices: TodayIndexBoard[] = [];
  let updatedAt: string | null = null;
  try {
    const board = await loadTodayBoard();
    indices = board.indices;
    updatedAt = board.updatedAt;
  } catch {
    indices = [];
  }

  const rows =
    indices.length > 0
      ? indices
      : ([
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
        ] as TodayIndexBoard[]);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
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
          <div style={{ fontSize: 22, fontWeight: 700, color: "#64748b" }}>
            Levels today · {formatBoardAsOf(updatedAt)}
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
          {rows.map((row) => (
            <Row key={row.symbol} row={row} />
          ))}
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 18,
            color: "#64748b",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Educational board — not investment advice</span>
          <span style={{ color: "#93c5fd", fontWeight: 700 }}>fnoninja.com/today</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
