"use client";

import { off, onChildAdded, orderByChild, query, ref, startAt } from "firebase/database";
import { useCallback, useEffect, useRef, useState } from "react";
import { initializeFirebase } from "@/firebase";
import {
  isAlertFresh,
  LIVE_SUCCESS_STORIES_RTDB_PATH,
  readDismissedStoryIds,
  rememberDismissedStoryId,
  type LiveSuccessStoryAlertClient,
} from "@/lib/sr-audit/live-success-story-client";

function playSoftChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.35);
    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    /* autoplay / unsupported */
  }
}

/**
 * Listens for live SR win alerts (public RTDB read) and shows a FOMO banner
 * with one-click Watch → opens the replay viewer.
 */
export function SuccessStoriesLiveListener({
  onWatch,
}: {
  onWatch: (eventId: string) => void;
}) {
  const [banner, setBanner] = useState<LiveSuccessStoryAlertClient | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Set<string>>(readDismissedStoryIds());

  const dismiss = useCallback((eventId: string) => {
    rememberDismissedStoryId(eventId);
    dismissedRef.current.add(eventId);
    setBanner((prev) => (prev?.eventId === eventId ? null : prev));
  }, []);

  useEffect(() => {
    const { database } = initializeFirebase();
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const q = query(
      ref(database, LIVE_SUCCESS_STORIES_RTDB_PATH),
      orderByChild("at"),
      startAt(sinceIso),
    );

    const handle = onChildAdded(q, (snap) => {
      const val = snap.val() as LiveSuccessStoryAlertClient | null;
      if (!val?.eventId || !val.at) return;
      if (seenRef.current.has(val.eventId)) return;
      seenRef.current.add(val.eventId);
      if (dismissedRef.current.has(val.eventId)) return;
      if (!isAlertFresh(val.at)) return;

      setBanner(val);
      playSoftChime();
    });

    return () => {
      off(q, "child_added", handle);
    };
  }, []);

  if (!banner) return null;

  const move = Number.isFinite(banner.movePct) ? banner.movePct.toFixed(1) : "—";
  const label = banner.label || banner.symbol;

  return (
    <div
      className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-[120] flex max-w-[min(22rem,calc(100vw-1.5rem))] justify-start pr-3"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-2xl backdrop-blur-md"
        style={{
          backgroundColor: "rgba(13,24,48,0.95)",
          borderColor: "rgba(96,165,250,0.35)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/90">
            Just hit · Success story
          </p>
          <p className="truncate text-sm font-bold text-white">
            {label}{" "}
            <span className="text-emerald-400">+{move}%</span>
            <span className="font-semibold text-slate-400"> to max pain</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onWatch(banner.eventId);
            dismiss(banner.eventId);
          }}
          className="shrink-0 rounded-xl bg-[#2563eb] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1d4ed8]"
        >
          Watch
        </button>
        <button
          type="button"
          onClick={() => dismiss(banner.eventId)}
          className="shrink-0 rounded-lg px-2 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
