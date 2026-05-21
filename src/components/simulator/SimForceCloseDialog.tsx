"use client";

import { useState } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SimTrade } from "@/lib/simulator";

export const SIM_FORCE_CLOSE_SAFETY_PHRASE = "I am an idiot";

function tradeLabel(t: SimTrade): string {
  return `${t.symbol} ${t.side}`;
}

/**
 * Admin kill switch — type safety phrase, then force-close sim + cascade live mirrors.
 */
export function SimForceCloseDialog({
  trades,
  onConfirm,
  children,
  extraNote,
}: {
  trades: SimTrade | SimTrade[];
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
  /** Shown under the main warning (e.g. exchange-scoped mirror page). */
  extraNote?: string;
}) {
  const list = Array.isArray(trades) ? trades : [trades];
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const confirmed = phrase === SIM_FORCE_CLOSE_SAFETY_PHRASE;

  const closeDialog = () => {
    setOpen(false);
    setPhrase("");
    setSubmitting(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setPhrase("");
          setSubmitting(false);
        }
      }}
    >
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </DialogTrigger>
      <DialogContent
        className="bg-[#1a1a1e] border-white/10 max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400" /> Kill switch
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-[12px] text-muted-foreground">
            {list.length === 1 ? (
              <>
                Force-close sim{" "}
                <span className="text-white font-bold">{tradeLabel(list[0]!)}</span> at
                market. This also closes every linked live mirror on all exchanges.
              </>
            ) : (
              <>
                Force-close{" "}
                <span className="text-white font-bold">{list.length} sim positions</span>{" "}
                at market and cascade to all linked live mirrors on every exchange.
              </>
            )}
          </p>
          {list.length > 1 && (
            <ul className="text-[11px] text-muted-foreground/80 list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
              {list.map((t) => (
                <li key={t.id ?? t.signalId}>
                  <span className="font-mono text-white/80">{tradeLabel(t)}</span>
                </li>
              ))}
            </ul>
          )}
          {extraNote && (
            <p className="text-[11px] text-amber-400/80 leading-snug">{extraNote}</p>
          )}
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground/60">
              Type{" "}
              <span className="font-mono font-bold text-rose-400">
                &quot;{SIM_FORCE_CLOSE_SAFETY_PHRASE}&quot;
              </span>{" "}
              to confirm:
            </p>
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={SIM_FORCE_CLOSE_SAFETY_PHRASE}
              className="bg-white/[0.03] border-white/10 text-white placeholder:text-muted-foreground/30 font-mono text-[12px]"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={submitting}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!confirmed || submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onConfirm();
                  closeDialog();
                } finally {
                  setSubmitting(false);
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-30"
            >
              {submitting ? "Closing…" : "Force close"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
