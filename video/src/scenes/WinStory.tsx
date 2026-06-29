import React, { useEffect, useRef } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
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

// Three-part reel: opening hook card → chart reveal → closing CTA card.
const INTRO_FRAMES = Math.round(2.4 * WIN_STORY_FPS);
const CHART_REVEAL_FRAMES = Math.round(5 * WIN_STORY_FPS);
const CHART_HOLD_FRAMES = Math.round(1.6 * WIN_STORY_FPS);
const CHART_FRAMES = CHART_REVEAL_FRAMES + CHART_HOLD_FRAMES;
const OUTRO_FRAMES = Math.round(3 * WIN_STORY_FPS);

export function winStoryDuration(): number {
  return INTRO_FRAMES + CHART_FRAMES + OUTRO_FRAMES;
}

/** Rotating opening hooks shown before the chart (no URL). */
const OPENING_CAPTIONS = [
  "Another day. Another winner.",
  "The market left clues.",
  "This setup was hiding in plain sight.",
  "Smart money showed its hand.",
  "Here's what the market was telling us.",
  "We spotted this before the move.",
  "The zones were clear.",
  "The options chain told the story.",
  "Another clean setup.",
  "The edge was visible.",
  "When positioning shifts, opportunities appear.",
  "One chart. One opportunity.",
  "Follow the data.",
  "The clues were all there.",
  "This is why we track positioning.",
  "Not a prediction. A read.",
  "Watch this setup unfold.",
  "The market gave us a roadmap.",
  "Sometimes the chart is crystal clear.",
  "Another textbook reaction.",
  "Spot. Plan. Profit.",
  "This is what conviction looks like.",
  "A simple setup with a powerful outcome.",
  "The levels mattered.",
  "Price followed the positioning.",
] as const;

/** Rotating closing lines shown after the chart (the CTA card appends fnoninja.com). */
const CLOSING_CAPTIONS = [
  "Another winner.",
  "The zones worked again.",
  "Built on data, not hope.",
  "Read the market. Take better trades.",
  "Follow the positioning.",
  "Where options lead, price follows.",
  "The edge is visible.",
  "Find opportunities faster.",
  "Market intelligence for traders.",
  "Consistency > Luck.",
  "Data in. Winner out.",
  "Discover what the market is watching.",
  "Trade with conviction.",
  "Spot high-conviction zones.",
  "Stop guessing. Start analyzing.",
  "Research in minutes, not hours.",
  "The market leaves footprints.",
  "Another setup. Another result.",
  "Let the data guide you.",
  "Find your edge.",
  "The streak continues.",
  "Precision beats prediction.",
  "See what others miss.",
  "Decode the options market.",
  "Trade smarter.",
] as const;

/** Stable hash so a given story always picks the same line, but stories vary. */
function seededIndex(seed: string, len: number, salt: number): number {
  let h = salt;
  for (const c of seed) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return Math.abs(h) % Math.max(1, len);
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

const REEL_BG = "linear-gradient(180deg, #0c1426 0%, #070b16 100%)";
const FONT = "ui-sans-serif, system-ui, sans-serif";

/** FNONINJA shuriken mark (CSS port of the canvas logo). */
const LogoMark: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.25,
      background: FNO_LOGO_MARK,
      position: "relative",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        position: "absolute",
        width: size * 0.26,
        height: size * 0.26,
        borderRadius: size * 0.05,
        background: FNO_LOGO_BG,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(45deg)",
      }}
    />
  </div>
);

const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
    <LogoMark size={size} />
    <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: size, letterSpacing: -1, lineHeight: 1 }}>
      <span style={{ color: FNO_TEXT }}>FNO</span>
      <span style={{ color: FNO_ACCENT }}>NINJA</span>
    </div>
  </div>
);

/** Opening hook card (before the chart). */
const IntroCard: React.FC<{ text: string; side: "support" | "resistance" }> = ({ text, side }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const accent = side === "support" ? "#34d399" : "#f87171";
  const opacity = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 16], [28, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: REEL_BG, opacity, justifyContent: "center", alignItems: "center", padding: 96 }}>
      <div style={{ transform: `translateY(${rise}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 34, letterSpacing: 6, color: accent, marginBottom: 40 }}>
          {side === "support" ? "PUT-WALL BOUNCE" : "CALL-WALL REJECTION"}
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 84, lineHeight: 1.15, color: "#f8fafc" }}>{text}</div>
      </div>
      <div style={{ position: "absolute", bottom: 110 }}>
        <Wordmark size={48} />
      </div>
    </AbsoluteFill>
  );
};

/** Closing CTA card (after the chart). */
const OutroCard: React.FC<{ text: string; side: "support" | "resistance" }> = ({ text, side }) => {
  const frame = useCurrentFrame();
  const accent = side === "support" ? "#34d399" : "#f87171";
  const lead = text.replace(/[.\s]+$/, "");
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rise = interpolate(frame, [0, 18], [30, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: REEL_BG, opacity, justifyContent: "center", alignItems: "center", padding: 96 }}>
      <div style={{ transform: `translateY(${rise}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 88, lineHeight: 1.12, color: "#f8fafc", marginBottom: 56 }}>
          {lead}
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 40, color: "#94a3b8" }}>
          Visit <span style={{ color: accent }}>fnoninja.com</span>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 150, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <Wordmark size={52} />
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 22, color: FNO_MUTED }}>
          Educational · Not investment advice
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The candle-reveal chart (canvas), with a short fade-in. Sits between the cards. */
const WinStoryChart: React.FC<WinStoryData> = (data) => {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const total = Math.max(1, data.candles.length);
  const progress = Math.min(1, frame / CHART_REVEAL_FRAMES);
  const revealCount = Math.ceil(progress * total);
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

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
    <AbsoluteFill style={{ backgroundColor: "#070b16", opacity }}>
      <canvas ref={canvasRef} width={REEL_W} height={REEL_H} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};

export const WinStory: React.FC<WinStoryData> = (data) => {
  const track = data.musicTrack ?? pickStoryTrack(`${data.symbol}|${data.side}|${data.eventAt}`);
  const seed = `${data.symbol}|${data.side}|${data.eventAt}`;
  const opening = OPENING_CAPTIONS[seededIndex(seed, OPENING_CAPTIONS.length, 5)]!;
  const closing = CLOSING_CAPTIONS[seededIndex(seed, CLOSING_CAPTIONS.length, 131)]!;

  return (
    <AbsoluteFill style={{ backgroundColor: "#070b16" }}>
      <BgMusic track={track} />
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard text={opening} side={data.side} />
      </Sequence>
      <Sequence from={INTRO_FRAMES} durationInFrames={CHART_FRAMES}>
        <WinStoryChart {...data} />
      </Sequence>
      <Sequence from={INTRO_FRAMES + CHART_FRAMES} durationInFrames={OUTRO_FRAMES}>
        <OutroCard text={closing} side={data.side} />
      </Sequence>
    </AbsoluteFill>
  );
};
