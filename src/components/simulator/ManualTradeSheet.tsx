"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { isAdminEmail } from "@/lib/admin-emails-client";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { SimBotSettings } from "@/lib/sim-bot-settings";
import {
  computeManualPositionSize,
  defaultSymbolForBot,
  normalizePerpSymbol,
  resolveManualRiskPct,
} from "@/lib/manual-sim-open";
import type { SimulatorState } from "@/lib/simulator";
import { createInitialState } from "@/lib/simulator";

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-foreground/80">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-mono uppercase"
      />
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  step = "any",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-foreground/80">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-mono"
      />
    </div>
  );
}

/** Admin manual punch — sim only or sim + live mirror. */
export function ManualTradeSheet({
  botId,
  label,
  capital,
  onOpened,
}: {
  botId: CockpitBotId;
  label: string;
  /** Current sim capital for size preview */
  capital: number;
  onOpened?: () => void;
}) {
  const { user } = useUser();
  const isAdmin = isAdminEmail(user?.email);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SimBotSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState(defaultSymbolForBot(botId));
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp1, setTp1] = useState("");
  const [tp2, setTp2] = useState("");
  const [tp3, setTp3] = useState("");
  const [mirrorMode, setMirrorMode] = useState<"sim" | "sim_and_live">("sim");
  const [note, setNote] = useState("");

  const previewState: SimulatorState = useMemo(
    () => ({ ...createInitialState("CRYPTO"), capital }),
    [capital],
  );

  const sizePreview = useMemo(() => {
    if (!settings) return null;
    const entryN = parseFloat(entry);
    const slN = parseFloat(sl);
    if (!Number.isFinite(entryN) || !Number.isFinite(slN) || entryN <= 0) return null;
    const riskPct = resolveManualRiskPct(botId, settings, previewState);
    return computeManualPositionSize(previewState, riskPct, entryN, slN, "60");
  }, [botId, settings, previewState, entry, sl]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    setLoadingSettings(true);
    fetch(`/api/settings/sim-bot/${botId}`)
      .then((r) => r.json())
      .then((data: SimBotSettings) => {
        setSettings(data);
        setLoadingSettings(false);
      })
      .catch(() => setLoadingSettings(false));
  }, [open, isAdmin, botId]);

  const handleSubmit = useCallback(async () => {
    if (!user || !isAdmin) return;
    setError(null);
    setSubmitting(true);
    try {
      const entryN = parseFloat(entry);
      const slN = parseFloat(sl);
      const tp1N = parseFloat(tp1);
      const tp2N = parseFloat(tp2);
      const tp3N = parseFloat(tp3);

      const token = await user.getIdToken();
      const res = await fetch("/api/sim/manual-open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          botId,
          symbol: normalizePerpSymbol(symbol),
          exchange: "BYBIT",
          side,
          entryPrice: entryN,
          stopLoss: slN,
          tp1: tp1N,
          tp2: tp2N,
          tp3: tp3N,
          mirrorMode,
          timeframe: "60",
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to open trade");
        return;
      }
      setOpen(false);
      onOpened?.();
      const liveNote = data.liveMirrorAttempted
        ? " Live mirror queued for opted-in users."
        : "";
      alert(
        `Opened ${data.tradeId}\nSize $${data.positionSize?.toFixed(2)} · ${data.leverage}x · risk ${(data.riskPctUsed * 100).toFixed(2)}%${liveNote}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [
    user,
    isAdmin,
    botId,
    symbol,
    side,
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    mirrorMode,
    note,
    onOpened,
  ]);

  if (!isAdmin) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={`Manual trade ${label}`}
        onClick={(e) => {
          stop(e);
          setOpen(true);
        }}
        onPointerDown={stop}
        className={cn(
          "flex items-center gap-1 rounded-lg border border-white/[0.12] bg-[#1a1a1f]",
          "px-2 py-1.5 hover:bg-[#222228] hover:border-amber-500/25 transition-all",
        )}
      >
        <Crosshair className="w-3.5 h-3.5 text-amber-400/70" />
        <span className="text-[8px] font-bold uppercase tracking-wider text-amber-400/60 hidden sm:inline">
          Manual
        </span>
      </button>

      <SheetContent side="right" className="w-[400px] sm:w-[440px] flex flex-col gap-0 p-0 z-[100]">
        <SheetHeader className="px-5 py-4 border-b border-white/[0.06]">
          <SheetTitle className="text-[13px] font-black uppercase tracking-widest">
            Manual — {label}
          </SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground/50">
            Punch entry, SL, and TPs. Size uses this bot&apos;s Config risk % and max
            open trades.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <TextInput
            label="Symbol (Bybit perp)"
            value={symbol}
            onChange={setSymbol}
            placeholder="BTCUSDT.P"
          />

          <div className="space-y-1">
            <span className="text-[11px] font-bold text-foreground/80">Side</span>
            <div className="flex gap-2">
              {(["BUY", "SELL"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={cn(
                    "flex-1 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wider",
                    side === s
                      ? s === "BUY"
                        ? "bg-positive/15 border-positive/30 text-positive"
                        : "bg-negative/15 border-negative/30 text-negative"
                      : "border-white/[0.08] text-muted-foreground/50",
                  )}
                >
                  {s === "BUY" ? "Long" : "Short"}
                </button>
              ))}
            </div>
          </div>

          <NumInput label="Price at alert (entry)" value={entry} onChange={setEntry} />
          <NumInput label="Stop loss" value={sl} onChange={setSl} />
          <div className="grid grid-cols-3 gap-2">
            <NumInput label="TP1" value={tp1} onChange={setTp1} />
            <NumInput label="TP2" value={tp2} onChange={setTp2} />
            <NumInput label="TP3" value={tp3} onChange={setTp3} />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-bold text-foreground/80">Execute as</span>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setMirrorMode("sim")}
                className={cn(
                  "py-2.5 px-3 rounded-lg border text-left text-[10px] transition-all",
                  mirrorMode === "sim"
                    ? "bg-accent/15 border-accent/30 text-accent"
                    : "border-white/[0.08] text-muted-foreground/55",
                )}
              >
                <span className="font-black uppercase tracking-wider">Sim only</span>
                <p className="text-[9px] mt-0.5 opacity-80">No exchange orders</p>
              </button>
              <button
                type="button"
                onClick={() => setMirrorMode("sim_and_live")}
                className={cn(
                  "py-2.5 px-3 rounded-lg border text-left text-[10px] transition-all",
                  mirrorMode === "sim_and_live"
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    : "border-white/[0.08] text-muted-foreground/55",
                )}
              >
                <span className="font-black uppercase tracking-wider">Sim + live</span>
                <p className="text-[9px] mt-0.5 opacity-80">
                  Mirror to users with Auto-Trade ON and zone-bot opt-in (if zone bot)
                </p>
              </button>
            </div>
          </div>

          {loadingSettings ? (
            <p className="text-[10px] text-muted-foreground/45">Loading bot risk settings…</p>
          ) : settings ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[10px] space-y-1">
              <p className="text-muted-foreground/50">
                Risk{" "}
                <span className="font-mono font-bold text-foreground/80">
                  {(resolveManualRiskPct(botId, settings, previewState) * 100).toFixed(2)}%
                </span>
                {" · "}
                Max open{" "}
                <span className="font-mono font-bold text-foreground/80">
                  {settings.maxOpenTrades}
                </span>
              </p>
              {sizePreview && !sizePreview.skip && (
                <p className="text-accent/90 font-mono">
                  Est. size ${sizePreview.size.toFixed(2)} @ {sizePreview.leverage}x
                </p>
              )}
              {sizePreview?.skip && (
                <p className="text-rose-400/80">{sizePreview.reason}</p>
              )}
            </div>
          ) : null}

          <input
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px]"
          />

          {error && (
            <p className="text-[10px] text-rose-400/90 px-2">{error}</p>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 text-black text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4" />
            )}
            {mirrorMode === "sim" ? "Open sim trade" : "Open sim + mirror live"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
