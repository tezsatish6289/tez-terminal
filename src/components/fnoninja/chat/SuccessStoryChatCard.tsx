"use client";

import { Check, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/firebase";
import type { ParsedSuccessStoryMessage } from "@/lib/chat/success-story-message";

/**
 * Win card with clear hierarchy: symbol + move, social proof, two CTAs.
 */
export function SuccessStoryChatCard({
  parsed,
  onWatch,
}: {
  parsed: ParsedSuccessStoryMessage;
  onWatch: () => void;
}) {
  const { user } = useUser();
  const [count, setCount] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storyId = parsed.storyId;

  const loadStats = useCallback(async () => {
    if (!storyId) return;
    try {
      const headers: HeadersInit = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(
        `/api/fnoninja/success-stories/traded?storyId=${encodeURIComponent(storyId)}`,
        { headers },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number; claimed?: boolean };
      setCount(typeof data.count === "number" ? data.count : 0);
      setClaimed(Boolean(data.claimed));
    } catch {
      /* ignore */
    }
  }, [storyId, user]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  async function onTraded() {
    if (!storyId) return;
    if (!user) {
      setError("Sign in to mark this");
      return;
    }
    if (claimed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/fnoninja/success-stories/traded", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storyId,
          symbol: parsed.symbol,
          movePct: parsed.movePct != null ? Number(parsed.movePct) : null,
        }),
      });
      const data = (await res.json()) as { error?: string; count?: number; claimed?: boolean };
      if (!res.ok) throw new Error(data.error || "Failed");
      setClaimed(true);
      if (typeof data.count === "number") setCount(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const setup =
    parsed.sideHint === "support"
      ? "Put-wall bounce"
      : parsed.sideHint === "resistance"
        ? "Call-wall rejection"
        : "Completed move";

  const tradedLabel =
    count === 0 ? "0 traded this" : count === 1 ? "1 traded this" : `${count} traded this`;

  return (
    <div
      className="mt-1.5 overflow-hidden rounded-xl"
      style={{
        border: "1px solid rgba(74,222,128,0.22)",
        background:
          "linear-gradient(160deg, rgba(16,42,28,0.45) 0%, rgba(13,24,48,0.96) 42%, rgba(10,18,36,0.98) 100%)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
      }}
    >
      <div
        className="h-[3px] w-full"
        style={{ background: "linear-gradient(90deg, #22c55e, #4ade80, #60a5fa)" }}
      />

      <div className="px-3.5 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/90">
            Just hit · {setup}
          </p>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
            style={{
              color: count > 0 ? "#86efac" : "#94a3b8",
              backgroundColor: count > 0 ? "rgba(34,197,94,0.14)" : "rgba(148,163,184,0.1)",
              border:
                count > 0
                  ? "1px solid rgba(74,222,128,0.35)"
                  : "1px solid rgba(148,163,184,0.22)",
            }}
          >
            {tradedLabel}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-0.5">
          <p className="text-[22px] font-black leading-none tracking-tight text-white">
            ${parsed.symbol}
          </p>
          {parsed.movePct ? (
            <p className="pb-0.5 text-[22px] font-black leading-none text-emerald-400">
              +{parsed.movePct}%
            </p>
          ) : null}
        </div>

        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">To max pain · not advice</p>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onWatch}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-2.5 text-[12px] font-bold text-white shadow-sm hover:bg-[#1d4ed8]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Watch replay
          </button>
          <button
            type="button"
            onClick={() => void onTraded()}
            disabled={busy || claimed || !storyId}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-colors disabled:opacity-85"
            style={{
              border: claimed
                ? "1px solid rgba(74,222,128,0.4)"
                : "1px solid rgba(148,163,184,0.4)",
              color: claimed ? "#86efac" : "#f1f5f9",
              backgroundColor: claimed ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
            }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : claimed ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            {claimed ? "You traded this" : "I traded this"}
          </button>
        </div>

        {error ? <p className="mt-2 text-[10px] text-amber-300">{error}</p> : null}
      </div>
    </div>
  );
}
