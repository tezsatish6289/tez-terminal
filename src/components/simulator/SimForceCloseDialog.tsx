"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUser } from "@/firebase";
import type { SimTrade } from "@/lib/simulator";

export const SIM_FORCE_CLOSE_SAFETY_PHRASE = "I am an idiot";

interface PreflightMirror {
  id: string;
  userId: string;
  exchange: string;
  side: string;
  qty: number;
  status: string;
}

interface PreflightPayload {
  simTrade: {
    id: string;
    symbol: string;
    side: string;
    status: string;
    currentPrice: number;
    entryPrice: number;
  };
  liveMirrors: PreflightMirror[];
  summary: {
    liveMirrorCount: number;
    userCount: number;
    byExchange: Record<string, number>;
  };
  /** Filled client-side when the preflight call fails so the UI can still
   *  show a useful warning instead of a silent empty preview. */
  error?: string;
}

function tradeLabel(t: SimTrade): string {
  return `${t.symbol} ${t.side}`;
}

function tradeKey(t: SimTrade): string {
  return t.id ?? (t.signalId ? `sim-${t.signalId}` : t.symbol);
}

function sumExchange(by: Record<string, number>): number {
  return Object.values(by).reduce((a, b) => a + b, 0);
}

/**
 * Pre-flight & success-message wrapper around `/api/sim/force-close`.
 *
 * Two stages:
 *   1. **Preview** — auto-fetches the impact summary (live mirror count,
 *      affected users, per-exchange breakdown) for every sim trade in
 *      `trades` as soon as the dialog opens. Shown as a red warning so
 *      the operator sees the blast radius *before* the safety-phrase
 *      input is enabled.
 *   2. **Confirm + execute** — once the phrase is typed, re-fetches the
 *      preview to detect drift (mirrors may have closed/opened in the
 *      seconds since the dialog opened). If counts changed, the
 *      execution is paused and the user must acknowledge the new total.
 *
 * The actual close call still happens in the caller's `onConfirm`
 * callback so existing toast / refresh wiring keeps working. The dialog
 * remains responsible for the *gates* (preview, phrase, drift detection).
 *
 * Admin-only: `/api/sim/force-close` now requires admin role on both GET
 * and POST. A signed-in non-admin will see the preflight return 403 here
 * and the action will refuse to enable.
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
  extraNote?: string;
}) {
  const list = useMemo(() => (Array.isArray(trades) ? trades : [trades]), [trades]);
  const { user } = useUser();

  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflight, setPreflight] = useState<PreflightPayload[]>([]);
  const [driftWarning, setDriftWarning] = useState<string | null>(null);

  const confirmed = phrase === SIM_FORCE_CLOSE_SAFETY_PHRASE;
  const allClosed = list.every((t) => t.status !== "OPEN");

  const fetchPreflight = useCallback(async (): Promise<PreflightPayload[]> => {
    if (!user || list.length === 0) return [];
    const token = await user.getIdToken();
    const results = await Promise.all(
      list.map(async (t): Promise<PreflightPayload> => {
        const id = t.id ?? (t.signalId ? `sim-${t.signalId}` : "");
        if (!id) {
          return {
            simTrade: {
              id: "",
              symbol: t.symbol,
              side: t.side,
              status: t.status ?? "UNKNOWN",
              currentPrice: t.currentPrice ?? t.entryPrice ?? 0,
              entryPrice: t.entryPrice ?? 0,
            },
            liveMirrors: [],
            summary: { liveMirrorCount: 0, userCount: 0, byExchange: {} },
            error: "Trade has no document id; preflight skipped",
          };
        }
        try {
          const res = await fetch(
            `/api/sim/force-close?simTradeId=${encodeURIComponent(id)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return {
              simTrade: {
                id,
                symbol: t.symbol,
                side: t.side,
                status: t.status ?? "UNKNOWN",
                currentPrice: t.currentPrice ?? t.entryPrice ?? 0,
                entryPrice: t.entryPrice ?? 0,
              },
              liveMirrors: [],
              summary: { liveMirrorCount: 0, userCount: 0, byExchange: {} },
              error:
                res.status === 403
                  ? "Admin role required to use kill switch"
                  : data.error ?? `Preflight failed (${res.status})`,
            };
          }
          return (await res.json()) as PreflightPayload;
        } catch (e) {
          return {
            simTrade: {
              id,
              symbol: t.symbol,
              side: t.side,
              status: t.status ?? "UNKNOWN",
              currentPrice: t.currentPrice ?? t.entryPrice ?? 0,
              entryPrice: t.entryPrice ?? 0,
            },
            liveMirrors: [],
            summary: { liveMirrorCount: 0, userCount: 0, byExchange: {} },
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    return results;
  }, [user, list]);

  useEffect(() => {
    if (!open) return;
    setPreflightLoading(true);
    setDriftWarning(null);
    fetchPreflight()
      .then((r) => setPreflight(r))
      .finally(() => setPreflightLoading(false));
  }, [open, fetchPreflight]);

  const totals = useMemo(() => {
    const aggExchange: Record<string, number> = {};
    const userSet = new Set<string>();
    let mirrors = 0;
    let preflightFailed = false;
    for (const p of preflight) {
      if (p.error) preflightFailed = true;
      mirrors += p.summary.liveMirrorCount;
      for (const m of p.liveMirrors) if (m.userId) userSet.add(m.userId);
      for (const [k, v] of Object.entries(p.summary.byExchange)) {
        aggExchange[k] = (aggExchange[k] ?? 0) + v;
      }
    }
    return {
      mirrors,
      users: userSet.size,
      byExchange: aggExchange,
      preflightFailed,
    };
  }, [preflight]);

  const adminBlocked = preflight.some(
    (p) => p.error?.includes("Admin role required"),
  );

  const closeDialog = () => {
    setOpen(false);
    setPhrase("");
    setSubmitting(false);
    setDriftWarning(null);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Drift check — re-run preflight and compare to what was previewed.
      // Counts may have moved (sync-live-trades just reconciled, another
      // mirror opened on a fresh deployment, etc.). If they did, pause
      // and surface the delta so the operator can confirm again.
      const fresh = await fetchPreflight();
      const freshMirrors = fresh.reduce(
        (acc, p) => acc + p.summary.liveMirrorCount,
        0,
      );
      const freshUsers = new Set<string>();
      for (const p of fresh) {
        for (const m of p.liveMirrors) if (m.userId) freshUsers.add(m.userId);
      }
      if (freshMirrors !== totals.mirrors || freshUsers.size !== totals.users) {
        setPreflight(fresh);
        setDriftWarning(
          `Numbers changed since preview: now ${freshMirrors} live mirror${freshMirrors === 1 ? "" : "s"} across ${freshUsers.size} user${freshUsers.size === 1 ? "" : "s"}. Re-confirm to proceed.`,
        );
        setPhrase("");
        setSubmitting(false);
        return;
      }
      await onConfirm();
      closeDialog();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setPhrase("");
          setSubmitting(false);
          setDriftWarning(null);
        }
      }}
    >
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </DialogTrigger>
      <DialogContent
        className="bg-[#1a1a1e] border-white/10 max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400" />
            {allClosed ? "Force close live mirrors" : "Kill switch"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 py-1">
          {/* Stage A — Impact preview */}
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 space-y-2">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-[11px] font-black uppercase tracking-wider">
                Impact preview
              </span>
            </div>
            {preflightLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading impact…
              </div>
            ) : adminBlocked ? (
              <p className="text-[11px] text-rose-300 leading-snug">
                Admin role required to use the kill switch. Ask the
                super-admin to grant you the role and reload.
              </p>
            ) : (
              <div className="space-y-2 text-[11px] text-white/85">
                <div>
                  Closing{" "}
                  <span className="font-bold text-white">
                    {list.length} sim trade{list.length === 1 ? "" : "s"}
                  </span>
                  {list.length === 1 ? (
                    <>
                      :{" "}
                      <span className="font-mono text-rose-300">
                        {tradeLabel(list[0]!)}
                      </span>
                    </>
                  ) : null}
                  .
                </div>
                <div>
                  This cascades to{" "}
                  <span className="font-bold text-rose-300">
                    {totals.mirrors} live position{totals.mirrors === 1 ? "" : "s"}
                  </span>{" "}
                  for{" "}
                  <span className="font-bold text-rose-300">
                    {totals.users} user{totals.users === 1 ? "" : "s"}
                  </span>
                  .
                </div>
                {sumExchange(totals.byExchange) > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {Object.entries(totals.byExchange)
                      .sort((a, b) => b[1] - a[1])
                      .map(([ex, n]) => (
                        <span
                          key={ex}
                          className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono"
                        >
                          <span className="text-muted-foreground/70">{ex}</span>
                          <span className="font-bold text-white">×{n}</span>
                        </span>
                      ))}
                  </div>
                )}
                {totals.mirrors === 0 && !totals.preflightFailed && (
                  <p className="text-[10px] text-muted-foreground/70 leading-snug pt-0.5">
                    No live mirrors found. Kill switch will only close the sim
                    record{list.length > 1 ? "s" : ""}.
                  </p>
                )}
                {totals.preflightFailed && (
                  <p className="text-[10px] text-amber-400/90 leading-snug pt-0.5">
                    Some preflight calls failed; numbers above may be
                    incomplete. The cron retry net will still sweep any
                    missed mirror within ~60s.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Multi-trade list */}
          {list.length > 1 && (
            <ul className="text-[10px] text-muted-foreground/80 list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto">
              {list.map((t) => (
                <li key={tradeKey(t)}>
                  <span className="font-mono text-white/80">{tradeLabel(t)}</span>
                </li>
              ))}
            </ul>
          )}

          {extraNote && (
            <p className="text-[10px] text-amber-400/85 leading-snug">{extraNote}</p>
          )}

          {/* Drift warning (re-confirm required after counts changed) */}
          {driftWarning && (
            <div className="rounded-md border border-amber-400/40 bg-amber-500/[0.08] px-2.5 py-1.5">
              <p className="text-[10px] text-amber-300 leading-snug">
                <span className="font-bold">Re-confirm: </span>
                {driftWarning}
              </p>
            </div>
          )}

          {/* Stage B — safety phrase */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground/60">
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
              disabled={preflightLoading || adminBlocked}
            />
          </div>

          <div className="flex gap-2 justify-end pt-0.5">
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
              disabled={
                !confirmed || submitting || preflightLoading || adminBlocked
              }
              onClick={handleConfirm}
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
