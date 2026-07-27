"use client";

import { Check, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/firebase";
import type { ParsedSuccessStoryMessage } from "@/lib/chat/success-story-message";

/**
 * Compact win card: Watch replay + I traded this (social-proof signal).
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
        : "Wall → max pain";

  const tradedLabel =
    count === 0
      ? "0 traded this"
      : count === 1
        ? "1 traded this"
        : `${count} traded this`;

  return (
    <div
      className="mt-1 overflow-hidden rounded-lg"
      style={{
        border: "1px solid rgba(96,165,250,0.2)",
        backgroundColor: "rgba(10,22,40,0.85)",
      }}
    >
      <div className="px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-bold tracking-tight text-white">
            ${parsed.symbol}
            {parsed.movePct ? (
              <span className="ml-1.5 font-extrabold text-emerald-400">+{parsed.movePct}%</span>
            ) : null}
          </p>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
            style={{
              color: count > 0 ? "#86efac" : "#94a3b8",
              backgroundColor:
                count > 0 ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.12)",
              border:
                count > 0
                  ? "1px solid rgba(74,222,128,0.3)"
                  : "1px solid rgba(148,163,184,0.2)",
            }}
            title="People who tapped I traded this"
          >
            {tradedLabel}
          </span>
        </div>

        <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
          {setup} · to max pain · not advice
        </p>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onWatch}
            className="inline-flex items-center justify-center gap-1 rounded-md bg-[#2563eb] px-2 py-1.5 text-[11px] font-bold text-white hover:bg-[#1d4ed8]"
          >
            <Play className="h-3 w-3 fill-current" />
            Watch replay
          </button>
          <button
            type="button"
            onClick={() => void onTraded()}
            disabled={busy || claimed || !storyId}
            className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-80"
            style={{
              border: claimed
                ? "1px solid rgba(74,222,128,0.35)"
                : "1px solid rgba(148,163,184,0.35)",
              color: claimed ? "#86efac" : "#e2e8f0",
              backgroundColor: claimed ? "rgba(34,197,94,0.1)" : "transparent",
            }}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : claimed ? (
              <Check className="h-3 w-3" />
            ) : null}
            {claimed ? "You traded this" : "I traded this"}
          </button>
        </div>
        {error ? <p className="mt-1 text-[10px] text-amber-300">{error}</p> : null}
      </div>
    </div>
  );
}
