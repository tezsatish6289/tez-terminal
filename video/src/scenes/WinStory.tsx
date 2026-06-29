import React, { useEffect, useRef } from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { MUSIC_TRACKS } from "../generated-tracks";

/**
 * Win-story reel (SR-audit success stories). This is a 1:1 port of the canvas
 * painter in src/components/admin/SrStoryReplay.tsx so the rendered MP4 matches
 * the admin preview exactly — candles reveal progressively, then the frame holds.
 *
 * A looping background track (rotated per story) plays under it, matching the
 * put/call cluster videos.
 */

/** Deterministic per-story track so each reel differs but re-renders are stable. */
function pickStoryTrack(seed: string): string {
  if (!MUSIC_TRACKS.length) return "audio/hitslab-soft-soft-background-music-423580.mp3";
  let h = 7;
  for (const c of seed) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return MUSIC_TRACKS[Math.abs(h) % MUSIC_TRACKS.length]!;
}

/** Looping bed with a gentle fade-in/out (mirrors ClusterVideo's BgMusic). */
const BgMusic: React.FC<{ track: string }> = ({ track }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const fadeIn = Math.round(fps * 0.6);
  const fadeOut = Math.round(fps * 1.2);
  const vol = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 0.5, 0.5, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <Audio src={staticFile(track)} loop volume={Math.max(0, vol)} />;
};

const storyBarSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
});

export const winStoryDataSchema = z.object({
  symbol: z.string(),
  label: z.string(),
  scope: z.enum(["stock", "index"]),
  side: z.enum(["support", "resistance"]),
  entrySpot: z.number(),
  maxPain: z.number().nullable(),
  invalidation: z.number().nullable(),
  putClusterStrike: z.number().nullable(),
  putClusterSize: z.number().nullable(),
  callClusterStrike: z.number().nullable(),
  callClusterSize: z.number().nullable(),
  bullZoneLow: z.number().nullable(),
  bullZoneHigh: z.number().nullable(),
  bearZoneLow: z.number().nullable(),
  bearZoneHigh: z.number().nullable(),
  movePct: z.number(),
  eventAt: z.string(),
  pocHitAt: z.string().nullable(),
  /** Background track under public/audio — defaults to a per-story rotation. */
  musicTrack: z.string().optional(),
  candles: z.array(storyBarSchema),
});
export type WinStoryData = z.infer<typeof winStoryDataSchema>;

export const WIN_STORY_FPS = 30;
const REVEAL_SECONDS = 5;
const HOLD_SECONDS = 2.5;

export function winStoryDuration(): number {
  return Math.round((REVEAL_SECONDS + HOLD_SECONDS) * WIN_STORY_FPS);
}

const REEL_W = 1080;
const REEL_H = 1920;
const CHART = { top: 330, left: 48, right: 232, bottom: 1500 };

const FNO_LOGO_MARK = "#3b82f6";
const FNO_LOGO_BG = "#080f1e";
const FNO_TEXT = "#f0f4ff";
const FNO_ACCENT = "#60a5fa";
const FNO_MUTED = "#64748b";

function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** "Jun 28, 14:30" without pulling in date-fns. */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawLogoMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 32;
  ctx.save();
  ctx.fillStyle = FNO_LOGO_MARK;
  roundRect(ctx, x, y, size, size, 8 * s);
  ctx.fill();
  const side = 8.4 * s;
  const origin = x + (size - side) / 2;
  const cy = y + size / 2;
  ctx.fillStyle = FNO_LOGO_BG;
  ctx.save();
  ctx.translate(origin + side / 2, cy);
  ctx.rotate(Math.PI / 4);
  roundRect(ctx, -side / 2, -side / 2, side, side, 0.56 * s);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawBrandWatermark(ctx: CanvasRenderingContext2D, rightX: number, baselineY: number) {
  const logoSize = 52;
  const gap = 16;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = "900 40px ui-sans-serif, system-ui";
  const fnoW = ctx.measureText("FNO").width;
  const ninjaW = ctx.measureText("NINJA").width;
  ctx.font = "700 24px ui-sans-serif, system-ui";
  const urlW = ctx.measureText("fnoninja.com").width;
  const textW = Math.max(fnoW + ninjaW, urlW);
  const blockW = logoSize + gap + textW;
  const blockLeft = rightX - blockW;
  const logoY = baselineY - logoSize + 8;
  drawLogoMark(ctx, blockLeft, logoY, logoSize);
  const textX = blockLeft + logoSize + gap;
  ctx.fillStyle = FNO_TEXT;
  ctx.font = "900 40px ui-sans-serif, system-ui";
  ctx.fillText("FNO", textX, baselineY - 4);
  ctx.fillStyle = FNO_ACCENT;
  ctx.fillText("NINJA", textX + fnoW, baselineY - 4);
  ctx.fillStyle = FNO_MUTED;
  ctx.font = "700 24px ui-sans-serif, system-ui";
  ctx.fillText("fnoninja.com", textX, baselineY + 28);
  ctx.restore();
}

/** Paint the full reel with `revealCount` candles shown. Ported from SrStoryReplay.draw. */
function draw(ctx: CanvasRenderingContext2D, data: WinStoryData, revealCount: number) {
  const bars = data.candles;
  if (!bars.length) return;

  const bg = ctx.createLinearGradient(0, 0, 0, REEL_H);
  bg.addColorStop(0, "#0c1426");
  bg.addColorStop(1, "#070b16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, REEL_W, REEL_H);

  const accent = data.side === "support" ? "#34d399" : "#f87171";

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "800 30px ui-sans-serif, system-ui";
  ctx.fillText(data.side === "support" ? "PUT-WALL BOUNCE" : "CALL-WALL REJECTION", CHART.left, 110);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 96px ui-sans-serif, system-ui";
  ctx.fillText(data.label, CHART.left, 210);

  ctx.fillStyle = "#64748b";
  ctx.font = "700 30px ui-sans-serif, system-ui";
  ctx.fillText(`${data.symbol} · ${data.scope.toUpperCase()}`, CHART.left, 256);

  ctx.textAlign = "right";
  ctx.fillStyle = "#86efac";
  ctx.font = "900 92px ui-sans-serif, system-ui";
  ctx.fillText(`+${data.movePct.toFixed(1)}%`, REEL_W - CHART.left, 210);
  ctx.fillStyle = "#64748b";
  ctx.font = "700 26px ui-sans-serif, system-ui";
  ctx.fillText("move to max pain", REEL_W - CHART.left, 250);
  ctx.textAlign = "left";

  const CL = CHART.left;
  const CT = CHART.top;
  const CW = REEL_W - CHART.left - CHART.right;
  const CH = CHART.bottom - CHART.top;
  ctx.fillStyle = "#050a14";
  roundRect(ctx, CL, CT, REEL_W - CHART.left * 2, CH, 20);
  ctx.fill();

  let min = Infinity;
  let max = -Infinity;
  for (const b of bars) {
    min = Math.min(min, b.l);
    max = Math.max(max, b.h);
  }
  for (const v of [
    data.maxPain,
    data.invalidation,
    data.entrySpot,
    data.bullZoneLow,
    data.bullZoneHigh,
    data.bearZoneLow,
    data.bearZoneHigh,
  ]) {
    if (v != null && Number.isFinite(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  const span = max - min || 1;
  min -= span * 0.06;
  max += span * 0.06;

  const plotRight = CL + CW;
  const x = (i: number) => CL + 24 + (i / Math.max(1, bars.length - 1)) * (CW - 24);
  const y = (p: number) => CT + 24 + (1 - (p - min) / (max - min)) * (CH - 48);

  const bandFill = (lo: number | null, hi: number | null, fill: string) => {
    if (lo == null || hi == null) return;
    ctx.fillStyle = fill;
    const yTop = y(Math.max(lo, hi));
    ctx.fillRect(CL + 24, yTop, CW - 24, Math.abs(y(lo) - y(hi)));
  };

  const hline = (p: number | null | undefined, color: string, label: string, dash: number[] = []) => {
    if (p == null || !Number.isFinite(p)) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CL + 24, y(p));
    ctx.lineTo(plotRight, y(p));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "800 22px ui-sans-serif, system-ui";
    ctx.fillText(label, plotRight + 12, y(p) + 8);
    ctx.restore();
  };

  bandFill(data.bullZoneLow, data.bullZoneHigh, "rgba(52,211,153,0.12)");
  bandFill(data.bearZoneLow, data.bearZoneHigh, "rgba(248,113,113,0.12)");

  const reveal = Math.max(1, Math.min(bars.length, revealCount));
  const cw = Math.max(3, ((CW - 24) / bars.length) * 0.62);
  for (let i = 0; i < reveal; i++) {
    const b = bars[i];
    const up = b.c >= b.o;
    ctx.strokeStyle = up ? "#10b981" : "#ef4444";
    ctx.fillStyle = up ? "#10b981" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(i), y(b.h));
    ctx.lineTo(x(i), y(b.l));
    ctx.stroke();
    const yo = y(b.o);
    const yc = y(b.c);
    ctx.fillRect(x(i) - cw / 2, Math.min(yo, yc), cw, Math.max(2, Math.abs(yc - yo)));
  }

  hline(data.putClusterStrike, "#34d399", `PUT ${compact(data.putClusterSize)}`, [8, 5]);
  hline(data.callClusterStrike, "#f87171", `CALL ${compact(data.callClusterSize)}`, [8, 5]);
  hline(data.entrySpot, "#93c5fd", "Entry", [6, 5]);
  hline(data.maxPain, "#fbbf24", "Max pain", [10, 6]);
  hline(data.invalidation, "#64748b", "Invalidation", [3, 6]);

  const fy = CHART.bottom + 70;
  const footerCells: [string, string, string][] = [
    ["ENTERED", fmtDate(data.eventAt), "#93c5fd"],
    ["MAX PAIN HIT", fmtDate(data.pocHitAt), "#fbbf24"],
  ];
  const fcW = (REEL_W - CHART.left * 2 - 24) / 2;
  footerCells.forEach(([k, v, col], i) => {
    const fx = CHART.left + i * (fcW + 24);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, fx, fy, fcW, 110, 16);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.font = "800 20px ui-sans-serif, system-ui";
    ctx.fillText(k, fx + 18, fy + 38);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "800 30px ui-sans-serif, system-ui";
    ctx.fillText(v, fx + 18, fy + 80);
  });

  drawBrandWatermark(ctx, REEL_W - CHART.left, fy + 160);
}

export const WinStory: React.FC<WinStoryData> = (data) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const total = Math.max(1, data.candles.length);
  const revealFrames = Math.max(1, Math.round(REVEAL_SECONDS * fps));
  const progress = Math.min(1, frame / revealFrames);
  const revealCount = Math.ceil(progress * total);
  const track = data.musicTrack ?? pickStoryTrack(`${data.symbol}|${data.side}|${data.eventAt}`);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, REEL_W, REEL_H);
    draw(ctx, data, revealCount);
  }, [data, revealCount]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#070b16" }}>
      <BgMusic track={track} />
      <canvas ref={canvasRef} width={REEL_W} height={REEL_H} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
