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

export interface StoryLevels {
  entrySpot: number;
  maxPain: number | null;
  invalidation: number | null;
  clusterStrike: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
}

export interface StoryReplayData {
  symbol: string;
  label: string;
  side: "support" | "resistance";
  movePct: number;
  eventAt: string;
  pocHitAt: string | null;
  candles: StoryBar[];
  levels: StoryLevels | null;
}

const W = 920;
const H = 460;
const PAD = { top: 28, right: 96, bottom: 28, left: 12 };

function niceColor(side: "support" | "resistance") {
  return side === "support" ? "#34d399" : "#f87171";
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
      const lv = data.levels;
      if (!bars.length) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Price range across all bars + key levels (so lines never clip).
      let min = Infinity;
      let max = -Infinity;
      for (const b of bars) {
        min = Math.min(min, b.l);
        max = Math.max(max, b.h);
      }
      for (const v of [
        data.levels?.maxPain,
        data.levels?.invalidation,
        data.levels?.entrySpot,
      ]) {
        if (v != null && Number.isFinite(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
      const span = max - min || 1;
      min -= span * 0.06;
      max += span * 0.06;

      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top - PAD.bottom;
      const x = (i: number) => PAD.left + (i / Math.max(1, bars.length - 1)) * plotW;
      const y = (p: number) => PAD.top + (1 - (p - min) / (max - min)) * plotH;

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
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y(p));
        ctx.lineTo(W - PAD.right, y(p));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "600 11px ui-sans-serif, system-ui";
        ctx.fillText(label, W - PAD.right + 6, y(p) + 3);
        ctx.restore();
      };

      // Cluster band shading.
      if (lv) {
        const lo = data.side === "support" ? lv.bullZoneLow : lv.bearZoneLow;
        const hi = data.side === "support" ? lv.bullZoneHigh : lv.bearZoneHigh;
        if (lo != null && hi != null) {
          ctx.fillStyle =
            data.side === "support" ? "rgba(52,211,153,0.10)" : "rgba(248,113,113,0.10)";
          const yTop = y(Math.max(lo, hi));
          ctx.fillRect(PAD.left, yTop, plotW, Math.abs(y(lo) - y(hi)));
        }
      }

      // Candles (revealed progressively).
      const reveal = Math.max(1, Math.min(bars.length, revealCount));
      const cw = Math.max(1.5, (plotW / bars.length) * 0.62);
      for (let i = 0; i < reveal; i++) {
        const b = bars[i];
        const up = b.c >= b.o;
        ctx.strokeStyle = up ? "#10b981" : "#ef4444";
        ctx.fillStyle = up ? "#10b981" : "#ef4444";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x(i), y(b.h));
        ctx.lineTo(x(i), y(b.l));
        ctx.stroke();
        const yo = y(b.o);
        const yc = y(b.c);
        ctx.fillRect(x(i) - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
      }

      // Level overlays on top.
      hline(lv?.entrySpot, "#93c5fd", "Entry", [4, 3]);
      hline(lv?.maxPain, "#fbbf24", "Max pain", [6, 4]);
      hline(lv?.invalidation, "#64748b", "Invalidation", [2, 4]);
    },
    [data],
  );

  const play = useCallback(() => {
    if (!data || !data.candles.length) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const total = data.candles.length;
    const durationMs = 4500;
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
      style={{ background: "rgba(2,6,23,0.8)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl border w-full max-w-4xl"
        style={{ borderColor: "rgba(255,255,255,0.1)", background: "#0b1220" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          {data ? (
            <div>
              <p className="text-sm font-bold text-white">
                {data.label}{" "}
                <span
                  className="ml-1 text-[11px] font-semibold uppercase"
                  style={{ color: niceColor(data.side) }}
                >
                  {data.side === "support" ? "Put-wall bounce" : "Call-wall rejection"}
                </span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Entered {format(new Date(data.eventAt), "MMM d, HH:mm")}
                {data.pocHitAt
                  ? ` · Max pain hit ${format(new Date(data.pocHitAt), "MMM d, HH:mm")}`
                  : ""}
                {" · "}
                <span className="font-bold text-emerald-400">
                  +{data.movePct.toFixed(1)}% move
                </span>
              </p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-300">Story replay</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="h-[460px] flex items-center justify-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !data || !data.candles.length ? (
            <div className="h-[460px] flex items-center justify-center text-center text-slate-500 text-sm px-8">
              No candle snapshot stored for this event yet. Snapshots are captured
              once an event reaches max pain with a qualifying move (and while the
              move is still inside the 30-day candle window).
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "#060b16" }}
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
