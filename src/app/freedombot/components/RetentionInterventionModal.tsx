"use client";

import { useEffect, useState } from "react";
import { Loader2, Bot, PauseCircle, Trash2 } from "lucide-react";
import type { User } from "firebase/auth";
import {
  RETENTION_FALLBACK_P90_DAYS,
  showsRetentionModal,
  type RetentionExchangeStats,
} from "@/lib/freedombot/retention-stats-shared";

export type RetentionIntent = "pause" | "delete";

interface RetentionInterventionModalProps {
  isOpen: boolean;
  intent: RetentionIntent;
  user: User | null;
  exchange: string;
  exchangeLabel: string;
  runningDays: number;
  lifetimeRealizedPnl: number | null;
  onKeepRunning: () => void;
  onContinueAnyway: () => void;
}

export function RetentionInterventionModal({
  isOpen,
  intent,
  user,
  exchange,
  exchangeLabel,
  runningDays,
  lifetimeRealizedPnl,
  onKeepRunning,
  onContinueAnyway,
}: RetentionInterventionModalProps) {
  const [stats, setStats] = useState<RetentionExchangeStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) {
      setStats(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(
          `/api/freedombot/retention-stats?exchange=${encodeURIComponent(exchange)}`,
          { headers: { Authorization: `Bearer ${idToken}` } },
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && typeof data.p90DaysToSustainedProfit === "number") {
          setStats(data as RetentionExchangeStats);
        } else {
          setStats(null);
        }
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, user, exchange]);

  if (!isOpen) return null;

  const p90Days = stats?.p90DaysToSustainedProfit ?? RETENTION_FALLBACK_P90_DAYS;
  const hasComputed =
    stats?.source === "computed" && (stats?.sampleSize ?? 0) > 0;
  const sampleSize = stats?.sampleSize ?? 0;

  const pnlKnown = lifetimeRealizedPnl != null && Number.isFinite(lifetimeRealizedPnl);
  const inDrawdown = pnlKnown && lifetimeRealizedPnl < 0;

  const statLine = hasComputed ? (
    <>
      On <span className="text-white font-semibold">{exchangeLabel}</span>,{" "}
      <span className="text-white font-semibold">90%</span> of accounts that reached sustained
      profit did so within about{" "}
      <span className="text-emerald-300 font-bold">{p90Days} days</span>
      {sampleSize > 0 ? (
        <>
          {" "}
          <span className="text-slate-500">(based on {sampleSize} accounts)</span>
        </>
      ) : null}
      .
    </>
  ) : (
    <>
      Many users on <span className="text-white font-semibold">{exchangeLabel}</span> who keep the
      bot running past the first few weeks tend to recover from early drawdowns — often around{" "}
      <span className="text-emerald-300 font-bold">{p90Days}+ days</span> of runtime.
    </>
  );

  const personalLine =
    runningDays > 0 ? (
      <p className="text-xs leading-relaxed mt-3" style={{ color: "#94a3b8" }}>
        You&apos;ve been running for{" "}
        <span className="text-white font-semibold">{runningDays} day{runningDays === 1 ? "" : "s"}</span>
        {inDrawdown ? (
          <>
            ; lifetime P&amp;L is{" "}
            <span className="text-rose-300 font-semibold">
              {lifetimeRealizedPnl!.toLocaleString(undefined, {
                maximumFractionDigits: 2,
                signDisplay: "exceptZero",
              })}
            </span>{" "}
            USDT — pausing now often locks in losses before the strategy has time to work.
          </>
        ) : pnlKnown && lifetimeRealizedPnl! >= 0 ? (
          <>; you&apos;re currently net positive on closed trades.</>
        ) : (
          <>.</>
        )}
      </p>
    ) : null;

  const deleteNote =
    intent === "delete" ? (
      <p className="text-xs leading-relaxed mt-3" style={{ color: "#fca5a5" }}>
        Deleting removes your API keys and breaks continuity — you&apos;ll need to deploy again and
        set up new keys on {exchangeLabel}.
      </p>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onKeepRunning}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "#0a1628",
          border: "1px solid rgba(59,130,246,0.25)",
        }}
      >
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{
            backgroundColor: "rgba(59,130,246,0.12)",
            border: "1px solid rgba(59,130,246,0.3)",
          }}
        >
          <Bot className="h-7 w-7" style={{ color: "#60a5fa" }} />
        </div>

        <h3 className="text-lg font-black text-white mb-1 text-center">Hi — I&apos;m FreedomBot</h3>
        <p className="text-[10px] font-bold uppercase tracking-widest text-center mb-4" style={{ color: "#475569" }}>
          Before you {intent === "pause" ? "pause" : "delete"}
        </p>

        <div
          className="rounded-2xl px-4 py-3 text-sm leading-relaxed space-y-3"
          style={{
            backgroundColor: "rgba(10,22,40,0.6)",
            border: "1px solid rgba(90,140,220,0.12)",
            color: "#cbd5e1",
          }}
        >
          <p>
            I want to share something important: {loading ? "…" : statLine}
          </p>
          <p>
            I only earn when you do — my incentives are aligned with yours. I&apos;d ask you to
            reconsider {intent === "pause" ? "pausing" : "leaving"} while you&apos;re still in the
            early part of the curve.
          </p>
          <p>
            If you need liquidity, you can{" "}
            <span className="text-white font-semibold">partially withdraw</span> on{" "}
            {exchangeLabel} — your funds stay in your exchange; we never have withdrawal access.
          </p>
          {personalLine}
          {deleteNote}
        </div>

        {loading && (
          <div className="flex justify-center mt-3">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#64748b" }} />
          </div>
        )}

        <div className="flex flex-col gap-2 mt-5">
          <button
            type="button"
            onClick={onKeepRunning}
            className="w-full py-3 rounded-2xl text-sm font-bold text-white transition-all hover:scale-[1.01]"
            style={{
              backgroundColor: "rgba(34,197,94,0.18)",
              border: "1px solid rgba(34,197,94,0.35)",
            }}
          >
            Keep bot running
          </button>
          <button
            type="button"
            onClick={onContinueAnyway}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all"
            style={{
              backgroundColor: "rgba(90,140,220,0.06)",
              color: "#94a3b8",
              border: "1px solid rgba(90,140,220,0.12)",
            }}
          >
            {intent === "pause" ? (
              <>
                <PauseCircle className="h-4 w-4" />
                Continue to pause
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Continue to delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Show retention for pause when in drawdown; always for delete. */
export function shouldShowRetentionIntervention(
  intent: RetentionIntent,
  lifetimeRealizedPnl: number | null,
): boolean {
  return showsRetentionModal(intent, lifetimeRealizedPnl);
}
