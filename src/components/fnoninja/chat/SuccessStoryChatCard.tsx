"use client";

import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/firebase";
import type { ParsedSuccessStoryMessage } from "@/lib/chat/success-story-message";

/**
 * Clean centered win card: JUST HIT → symbol → move → two CTAs → social proof.
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

  const subtitle = parsed.label ? `${parsed.label} · NSE` : "NSE";
  const tradedLabel =
    count === 0
      ? "0 people traded this"
      : count === 1
        ? "1 person traded this"
        : `${count} people traded this`;

  return (
    <div
      className="mt-1.5 rounded-2xl p-px"
      style={{
        background: "linear-gradient(135deg, rgba(74,222,128,0.55), rgba(96,165,250,0.35))",
      }}
    >
      <div
        className="flex flex-col items-center rounded-[15px] px-5 py-6 text-center"
        style={{ background: "#0b1220" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-400">
            Just hit
          </p>
        </div>

        <p className="mt-3 text-[26px] font-black leading-none tracking-tight text-white">
          ${parsed.symbol}
        </p>

        <p className="mt-2 text-[12px] font-medium text-slate-400">{subtitle}</p>

        {parsed.movePct ? (
          <p className="mt-4 text-[36px] font-black leading-none tracking-tight text-emerald-400">
            +{parsed.movePct}%
          </p>
        ) : null}

        <p className="mt-2 text-[11px] text-slate-500">To max pain · not advice</p>

        <div className="mt-5 flex w-full max-w-[280px] items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onWatch}
            className="flex-1 rounded-lg bg-[#4f6ef7] px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-[#3f5ce0]"
          >
            Watch replay
          </button>
          <button
            type="button"
            onClick={() => void onTraded()}
            disabled={busy || claimed || !storyId}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-90"
            style={{
              border: claimed
                ? "1px solid rgba(74,222,128,0.45)"
                : "1px solid rgba(148,163,184,0.35)",
              color: claimed ? "#86efac" : "#f1f5f9",
              backgroundColor: claimed ? "rgba(34,197,94,0.1)" : "transparent",
            }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {claimed ? "You traded this" : "I traded this"}
          </button>
        </div>

        <p className="mt-4 text-[11px] text-slate-500">{tradedLabel}</p>

        {error ? <p className="mt-2 text-[11px] text-amber-300">{error}</p> : null}
      </div>
    </div>
  );
}
