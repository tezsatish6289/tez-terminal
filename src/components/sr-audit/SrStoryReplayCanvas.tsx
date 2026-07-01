"use client";

import { format } from "date-fns";
import { Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";

const REEL_W = 1080;
const REEL_H = 1920;
const CHART = { top: 330, left: 48, right: 232, bottom: 1480 };
/** Candle reveal duration + hold on final frame before advancing carousel. */
const REPLAY_DURATION_MS = 8_000;
const REPLAY_HOLD_MS = 3_200;
const FOOTER = {
  topGap: 44,
  height: 156,
  labelPx: 26,
  leftDatePx: 38,
  rightDatePx: 52,
  padX: 22,
  logoGap: 88,
} as const;

const FNO_LOGO_MARK = "#3b82f6";
const FNO_LOGO_BG = "#080f1e";
const FNO_TEXT = "#f0f4ff";
const FNO_ACCENT = "#60a5fa";
const FNO_MUTED = "#64748b";

function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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
  ctx.font = "900 40px ui-sans-serif, system-ui";
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

export function drawStoryReplayFrame(
  canvas: HTMLCanvasElement,
  data: StoryReplayData,
  revealCount: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bars = data.candles;
  if (!bars.length) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = REEL_W * dpr;
  canvas.height = REEL_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = ctx.createLinearGradient(0, 0, 0, REEL_H);
  bg.addColorStop(0, "#0c1426");
  bg.addColorStop(1, "#070b16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, REEL_W, REEL_H);

  const accent = data.side === "support" ? "#34d399" : "#f87171";

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = accent;
  ctx.font = "800 30px ui-sans-serif, system-ui";
  ctx.fillText(
    data.side === "support" ? "PUT-WALL BOUNCE" : "CALL-WALL REJECTION",
    CHART.left,
    110,
  );

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

  const hline = (
    p: number | null | undefined,
    color: string,
    label: string,
    dash: number[] = [],
  ) => {
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

  const fmt = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, HH:mm") : "—");
  const fy = CHART.bottom + FOOTER.topGap;
  const footerCells: [string, string, string][] = [
    ["ENTERED", fmt(data.eventAt), "#93c5fd"],
    ["MAX PAIN HIT", fmt(data.pocHitAt), "#fbbf24"],
  ];
  const fcW = (REEL_W - CHART.left * 2 - 24) / 2;
  footerCells.forEach(([k, v, col], i) => {
    const fx = CHART.left + i * (fcW + 24);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, fx, fy, fcW, FOOTER.height, 18);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.font = `800 ${FOOTER.labelPx}px ui-sans-serif, system-ui`;
    ctx.fillText(k, fx + FOOTER.padX, fy + 44);
    ctx.fillStyle = "#e2e8f0";
    const datePx = i === 1 ? FOOTER.rightDatePx : FOOTER.leftDatePx;
    ctx.font = `800 ${datePx}px ui-sans-serif, system-ui`;
    ctx.fillText(v, fx + FOOTER.padX, fy + FOOTER.height - 30);
  });

  drawBrandWatermark(ctx, REEL_W - CHART.left, fy + FOOTER.height + FOOTER.logoGap);
}

export function SrStoryReplayCanvas({
  data,
  autoPlay = false,
  active = false,
  loop = true,
  showControls = false,
  onComplete,
  className = "",
}: {
  data: StoryReplayData;
  /** Legacy: always play on mount (admin modal). */
  autoPlay?: boolean;
  /** Play once while true (marketing cards). */
  active?: boolean;
  loop?: boolean;
  showControls?: boolean;
  onComplete?: () => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const draw = useCallback(
    (revealCount: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !data.candles.length) return;
      drawStoryReplayFrame(canvas, data, revealCount);
    },
    [data],
  );

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
    rafRef.current = null;
    loopTimerRef.current = null;
  }, []);

  const play = useCallback(() => {
    if (!data.candles.length) return;
    stop();

    const total = data.candles.length;
    const durationMs = REPLAY_DURATION_MS;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setProgress(t);
      draw(Math.ceil(t * total));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else if (loop) {
        loopTimerRef.current = window.setTimeout(() => {
          setProgress(0);
          play();
        }, 1200);
      } else if (onCompleteRef.current) {
        draw(total);
        loopTimerRef.current = window.setTimeout(() => {
          onCompleteRef.current?.();
        }, REPLAY_HOLD_MS);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [data, draw, loop, stop]);

  const shouldPlay = autoPlay || active;

  useEffect(() => {
    if (!data.candles.length) return;

    if (shouldPlay) {
      setProgress(0);
      play();
    } else {
      stop();
      setProgress(0);
      draw(data.candles.length);
    }

    return stop;
  }, [shouldPlay, data, play, draw, stop]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={play}
        className="block w-full rounded-xl overflow-hidden text-left"
        aria-label={`Replay ${data.label}`}
      >
        <canvas ref={canvasRef} className="w-full h-auto block" />
      </button>

      {showControls ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={play}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border border-white/10 hover:bg-white/5"
          >
            {progress > 0 && progress < 1 ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Replay
          </button>
          <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-75"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
