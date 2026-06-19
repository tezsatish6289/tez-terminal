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

const W = 980;
const H = 500;
const PAD = { top: 16, right: 132, bottom: 40, left: 12 };

function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
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
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Price range across bars + every level we draw (so nothing clips).
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
      const range = max - min || 1;
      min -= range * 0.05;
      max += range * 0.05;

      const plotW = W - PAD.left - PAD.right;
      const plotH = H - PAD.top - PAD.bottom;
      const x = (i: number) => PAD.left + (i / Math.max(1, bars.length - 1)) * plotW;
      const y = (p: number) => PAD.top + (1 - (p - min) / (max - min)) * plotH;

      const idxForTime = (iso: string | null): number | null => {
        if (!iso) return null;
        const ts = Math.floor(Date.parse(iso) / 1000);
        if (!Number.isFinite(ts)) return null;
        let best = 0;
        let bd = Infinity;
        for (let i = 0; i < bars.length; i++) {
          const d = Math.abs(bars[i].t - ts);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        return best;
      };

      const band = (lo: number | null, hi: number | null, fill: string) => {
        if (lo == null || hi == null) return;
        ctx.fillStyle = fill;
        const yTop = y(Math.max(lo, hi));
        ctx.fillRect(PAD.left, yTop, plotW, Math.abs(y(lo) - y(hi)));
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
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y(p));
        ctx.lineTo(W - PAD.right, y(p));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "600 10px ui-sans-serif, system-ui";
        ctx.fillText(label, W - PAD.right + 6, y(p) + 3);
        ctx.restore();
      };

      const vmarker = (iso: string | null, color: string, label: string) => {
        const i = idxForTime(iso);
        if (i == null) return;
        const px = x(i);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, PAD.top);
        ctx.lineTo(px, H - PAD.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "700 9px ui-sans-serif, system-ui";
        ctx.fillText(label, Math.min(px + 4, W - PAD.right - 60), PAD.top + 10);
        ctx.restore();
      };

      // Both zone bands (put = support/green, call = resistance/red).
      band(data.bullZoneLow, data.bullZoneHigh, "rgba(52,211,153,0.10)");
      band(data.bearZoneLow, data.bearZoneHigh, "rgba(248,113,113,0.10)");

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

      // Level lines (incl. OI labels at the wall strikes).
      hline(
        data.putClusterStrike,
        "#34d399",
        `PUT ${compact(data.putClusterSize)}`,
        [5, 3],
      );
      hline(
        data.callClusterStrike,
        "#f87171",
        `CALL ${compact(data.callClusterSize)}`,
        [5, 3],
      );
      hline(data.entrySpot, "#93c5fd", "Entry", [4, 3]);
      hline(data.maxPain, "#fbbf24", "Max pain", [6, 4]);
      hline(data.invalidation, "#64748b", "Invalidation", [2, 4]);

      // Date markers along the move.
      vmarker(data.eventAt, "#93c5fd", "ENTRY");
      vmarker(data.pocHitAt, "#fbbf24", "MAX PAIN");
      vmarker(data.resolvedAt, "#94a3b8", (data.resolveReason ?? "EXIT").toUpperCase());
    },
    [data],
  );

  const play = useCallback(() => {
    if (!data || !data.candles.length) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const total = data.candles.length;
    const durationMs = 4800;
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

  const fmt = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, HH:mm") : "—");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(2,6,23,0.82)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl border w-full max-w-5xl"
        style={{ borderColor: "rgba(255,255,255,0.1)", background: "#0b1220" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-3 border-b border-white/10">
          {data ? (
            <div>
              <p className="text-sm font-bold text-white">
                {data.label}
                <span className="ml-1.5 text-[10px] font-semibold uppercase text-slate-500">
                  {data.symbol} · {data.scope}
                </span>
                <span
                  className="ml-1.5 text-[11px] font-semibold uppercase"
                  style={{ color: data.side === "support" ? "#34d399" : "#f87171" }}
                >
                  {data.side === "support" ? "Put-wall bounce" : "Call-wall rejection"}
                </span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                <span>Expiry {data.zonesExpiry ?? "—"}</span>
                <span>Max pain {data.maxPain != null ? data.maxPain.toFixed(2) : "—"}</span>
                {data.atmIV != null ? <span>IV {data.atmIV.toFixed(1)}%</span> : null}
                {data.entryRr != null ? <span>RR {data.entryRr.toFixed(1)}:1</span> : null}
                <span className="font-bold text-emerald-400">+{data.movePct.toFixed(1)}% move</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                <span>Entered {fmt(data.eventAt)}</span>
                <span className="text-amber-300/80">Max pain hit {fmt(data.pocHitAt)}</span>
                <span>
                  {data.resolveReason ? `${data.resolveReason} ` : "Exit "}
                  {fmt(data.resolvedAt)}
                </span>
                {data.finalPnlPct != null ? (
                  <span style={{ color: data.finalPnlPct >= 0 ? "#86efac" : "#fca5a5" }}>
                    Final {data.finalPnlPct.toFixed(1)}%
                  </span>
                ) : null}
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
            <div className="h-[500px] flex items-center justify-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !data || !data.candles.length ? (
            <div className="h-[500px] flex items-center justify-center text-center text-slate-500 text-sm px-8">
              No candle snapshot stored for this event yet. Snapshots are captured
              once an event reaches max pain (and while the move is still inside the
              30-day candle window).
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "#060b16" }}>
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
