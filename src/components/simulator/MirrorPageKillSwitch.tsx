"use client";

import { useCallback, useEffect, useState } from "react";
import { Skull, Loader2 } from "lucide-react";
import { useUser } from "@/firebase";
import { SimForceCloseDialog } from "@/components/simulator/SimForceCloseDialog";
import type { SimTrade } from "@/lib/simulator";
import { cn } from "@/lib/utils";

/** Kill switch for mirror admin pages — closes open sim book + all live cascades. */
export function MirrorPageKillSwitch({
  simTradeIds,
  exchangeLabel,
  onClosed,
}: {
  simTradeIds: string[];
  /** e.g. BYBIT — shown in dialog so admin knows cascade is global */
  exchangeLabel?: string;
  onClosed?: () => void;
}) {
  const { user } = useUser();
  const [openTrades, setOpenTrades] = useState<SimTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [killError, setKillError] = useState<string | null>(null);

  const loadOpen = useCallback(async () => {
    if (!user || simTradeIds.length === 0) {
      setOpenTrades([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setKillError(null);
    try {
      const token = await user.getIdToken();
      const trades: SimTrade[] = [];
      await Promise.all(
        simTradeIds.map(async (id) => {
          const res = await fetch(`/api/admin/sim-open-trades/${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          const t = data.simTrade as SimTrade;
          if (t?.status === "OPEN" && t.id) trades.push({ ...t, id: t.id ?? id });
        }),
      );
      setOpenTrades(trades);
    } catch (e: unknown) {
      setKillError(e instanceof Error ? e.message : "Failed to load sim trades");
      setOpenTrades([]);
    } finally {
      setLoading(false);
    }
  }, [user, simTradeIds]);

  useEffect(() => {
    void loadOpen();
  }, [loadOpen]);

  const handleKill = useCallback(async () => {
    if (!user || openTrades.length === 0) return;
    setKillError(null);
    const token = await user.getIdToken();
    let liveClosed = 0;
    const errors: string[] = [];

    for (const trade of openTrades) {
      const id = trade.id;
      if (!id) continue;
      const res = await fetch("/api/sim/force-close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ simTradeId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        errors.push(`${trade.symbol}: ${data.error ?? res.status}`);
        continue;
      }
      liveClosed += data.liveClosed ?? 0;
      if (data.liveErrors?.length) {
        errors.push(...data.liveErrors);
      }
    }

    await loadOpen();
    onClosed?.();

    if (errors.length > 0) {
      setKillError(
        `Sim closed. Live: ${liveClosed} position(s) closed. Issues: ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? "…" : ""}`,
      );
    } else {
      setKillError(null);
      alert(
        openTrades.length === 1
          ? `Kill switch: sim closed, ${liveClosed} live mirror(s) closed.`
          : `Kill switch: ${openTrades.length} sim trade(s) closed, ${liveClosed} live mirror(s) closed.`,
      );
    }
  }, [user, openTrades, loadOpen, onClosed]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/45">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking sim book…
      </div>
    );
  }

  if (openTrades.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/45">
        Sim position already closed — live mirrors may clear on the next sync.
      </p>
    );
  }

  const extraNote = exchangeLabel
    ? `You are viewing ${exchangeLabel} mirrors only, but kill switch closes the sim trade and every linked live position on all exchanges.`
    : undefined;

  return (
    <div className="space-y-2">
      <SimForceCloseDialog
        trades={openTrades}
        onConfirm={handleKill}
        extraNote={extraNote}
      >
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10",
            "px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-300",
            "hover:bg-rose-500/20 hover:border-rose-500/50 transition-colors",
          )}
        >
          <Skull className="h-3.5 w-3.5" />
          Kill switch — close sim + all live mirrors
        </button>
      </SimForceCloseDialog>
      {killError && (
        <p className="text-[10px] text-amber-400/90 leading-snug max-w-xl">{killError}</p>
      )}
    </div>
  );
}
