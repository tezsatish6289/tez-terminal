"use client";

import { format } from "date-fns";
import { Loader2, Play, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface StoryBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface StoryReplayData {
  symbol: string;
  label: string;
  scope: "stock" | "index";
  side: "support" | "resistance";
  entrySpot: number;
  maxPain: number | null;
  invalidation: number | null;
  putClusterStrike: number | null;
  putClusterSize: number | null;
  callClusterStrike: number | null;
  callClusterSize: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  zonesExpiry: string | null;
  atmIV: number | null;
  entryRr: number | null;
  movePct: number;
  maxPainDistancePct: number;
  eventAt: string;
  pocHitAt: string | null;
  resolvedAt: string | null;
  resolveReason: string | null;
  finalPnlPct: number | null;
  candles: StoryBar[];
}

// 9:16 reel canvas (social / Remotion short). Everything is painted on the
// canvas so this preview is a 1:1 of the eventual rendered video.
const REEL_W = 1080;
const REEL_H = 1920;
// Chart sub-region inside the reel.
const CHART = { top: 330, left: 48, right: 232, bottom: 1500 };

function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function SrStoryReplay({
  data,
  loading,
  onClose,
}: {
  data: StoryReplayData | null;
  loading: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(1);

  const draw = useCallback(
    (revealCount: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !data) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bars = data.candles;
      if (!bars.length) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = REEL_W * dpr;
      canvas.height = REEL_H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ----- Background -----
      const bg = ctx.createLinearGradient(0, 0, 0, REEL_H);
      bg.addColorStop(0, "#0c1426");
      bg.addColorStop(1, "#070b16");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, REEL_W, REEL_H);

      const accent = data.side === "support" ? "#34d399" : "#f87171";

      // ----- Header -----
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

      // Big move headline (right aligned).
      ctx.textAlign = "right";
      ctx.fillStyle = "#86efac";
      ctx.font = "900 92px ui-sans-serif, system-ui";
      ctx.fillText(`+${data.movePct.toFixed(1)}%`, REEL_W - CHART.left, 210);
      ctx.fillStyle = "#64748b";
      ctx.font = "700 26px ui-sans-serif, system-ui";
      ctx.fillText("move to max pain", REEL_W - CHART.left, 250);
      ctx.textAlign = "left";

      // ----- Chart region -----
      const CL = CHART.left;
      const CT = CHART.top;
      const CW = REEL_W - CHART.left - CHART.right;
      const CH = CHART.bottom - CHART.top;
      ctx.fillStyle = "#050a14";
      roundRect(ctx, CL, CT, REEL_W - CHART.left * 2, CH, 20);
      ctx.fill();

      // Price range over bars + every level.
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

      // Zone bands (put = support/green, call = resistance/red).
      bandFill(data.bullZoneLow, data.bullZoneHigh, "rgba(52,211,153,0.12)");
      bandFill(data.bearZoneLow, data.bearZoneHigh, "rgba(248,113,113,0.12)");

      // Candles (progressive reveal).
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

      // Level lines.
      hline(data.putClusterStrike, "#34d399", `PUT ${compact(data.putClusterSize)}`, [8, 5]);
      hline(data.callClusterStrike, "#f87171", `CALL ${compact(data.callClusterSize)}`, [8, 5]);
      hline(data.entrySpot, "#93c5fd", "Entry", [6, 5]);
      hline(data.maxPain, "#fbbf24", "Max pain", [10, 6]);
      hline(data.invalidation, "#64748b", "Invalidation", [3, 6]);

      // ----- Footer -----
      const fmt = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, HH:mm") : "—");
      const fy = CHART.bottom + 70;
      const footerCells: [string, string, string][] = [
        ["ENTERED", fmt(data.eventAt), "#93c5fd"],
        ["MAX PAIN HIT", fmt(data.pocHitAt), "#fbbf24"],
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

      // Branding strip.
      const by = fy + 160;
      ctx.textAlign = "right";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "900 40px ui-sans-serif, system-ui";
      ctx.fillText("FNONINJA", REEL_W - CHART.left, by - 8);
      ctx.fillStyle = "#475569";
      ctx.font = "700 24px ui-sans-serif, system-ui";
      ctx.fillText("fnoninja.com", REEL_W - CHART.left, by + 30);
      ctx.textAlign = "left";
    },
    [data],
  );

  const play = useCallback(() => {
    if (!data || !data.candles.length) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const total = data.candles.length;
    const durationMs = 5200;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setProgress(t);
      draw(Math.ceil(t * total));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [data, draw]);

  useEffect(() => {
    if (data && data.candles.length) play();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(2,6,23,0.88)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl border flex flex-col"
        style={{
          borderColor: "rgba(255,255,255,0.1)",
          background: "#0b1220",
          maxHeight: "94vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
            Story reel · 9:16
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 flex items-center justify-center overflow-auto">
          {loading ? (
            <div
              className="flex items-center justify-center text-slate-500"
              style={{ width: 360, height: 640 }}
            >
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !data || !data.candles.length ? (
            <div
              className="flex items-center justify-center text-center text-slate-500 text-sm px-8"
              style={{ width: 360, height: 640 }}
            >
              No candle snapshot stored for this event yet. Snapshots are captured
              once an event reaches max pain (and while the move is still inside the
              30-day candle window).
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden shadow-2xl"
              style={{ width: "min(420px, 86vw)" }}
            >
              <canvas
                ref={canvasRef}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </div>
          )}
        </div>

        {data && data.candles.length ? (
          <div className="flex items-center gap-3 px-5 pb-4">
            <button
              type="button"
              onClick={play}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border border-white/10 hover:bg-white/5"
            >
              {progress < 1 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Replay
            </button>
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-[width] duration-75"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <Play className="h-3.5 w-3.5 text-slate-500" />
          </div>
        ) : null}
      </div>
    </div>
  );
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
