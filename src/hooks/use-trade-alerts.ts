"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";
import type { SentimentResult } from "@/lib/sentiment";

export interface AlertableSignal {
  id: string;
  type: string;
  timeframe: string;
  symbol: string;
  status: string;
}

const BULLISH_LABELS = new Set(["Bulls in control", "Bulls taking over"]);
const BEARISH_LABELS = new Set(["Bears in control", "Bears taking over"]);

const TIMEFRAME_NAMES: Record<string, string> = {
  "5": "Scalping",
  "15": "Intraday",
  "60": "BTST",
  "240": "Swing",
  "D": "Buy & Hold",
};

function isAligned(signalType: string, sentimentLabel: string): boolean {
  if (signalType === "BUY" && BULLISH_LABELS.has(sentimentLabel)) return true;
  if (signalType === "SELL" && BEARISH_LABELS.has(sentimentLabel)) return true;
  return false;
}

function playChime() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;

    // Three ascending tones: E5 → G5 → C6 (a major arpeggio — pleasant "opportunity" chime)
    const notes = [
      { freq: 659.25, start: 0, dur: 0.25, vol: 0.3 },
      { freq: 783.99, start: 0.15, dur: 0.25, vol: 0.3 },
      { freq: 1046.5, start: 0.3, dur: 0.35, vol: 0.25 },
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = n.freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur);
    }

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Web Audio not available
  }
}

function showBrowserNotification(signal: AlertableSignal, sentimentLabel: string) {
  if (typeof window === "undefined" || Notification.permission !== "granted") return;

  const direction = signal.type === "BUY" ? "LONG" : "SHORT";
  const tfName = TIMEFRAME_NAMES[signal.timeframe] || signal.timeframe;

  try {
    new Notification(`${signal.symbol} — ${direction}`, {
      body: `${tfName} trade aligned with market: ${sentimentLabel}`,
      tag: `trade-${signal.id}`,
      requireInteraction: false,
    });
  } catch {
    // Notification API not available
  }
}

/**
 * Monitors the real-time signal stream for new trades that are aligned with
 * the current market sentiment. When a bullish trade arrives during a bullish
 * market (or bearish during bearish), fires a browser push notification and
 * plays an ascending chime.
 */
export function useTradeAlerts(
  signals: AlertableSignal[] | null,
  sentimentByTimeframe: Record<string, SentimentResult>,
) {
  const seenRef = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;

    if (Notification.permission === "granted") {
      setEnabled(true);
      playChime();
      return true;
    }
    if (Notification.permission === "denied") {
      toast({
        variant: "destructive",
        title: "Notifications blocked",
        description:
          "Browser notifications are blocked. Enable them in your browser settings and try again.",
      });
      return false;
    }

    const result = await Notification.requestPermission();
    const ok = result === "granted";
    setEnabled(ok);
    if (ok) playChime();
    return ok;
  }, []);

  const disable = useCallback(() => setEnabled(false), []);

  useEffect(() => {
    if (!signals || signals.length === 0) return;

    // On first data load, record all existing IDs — don't alert for them
    if (!readyRef.current) {
      for (const s of signals) seenRef.current.add(s.id);
      readyRef.current = true;
      return;
    }

    const fresh: AlertableSignal[] = [];
    for (const s of signals) {
      if (!seenRef.current.has(s.id)) {
        seenRef.current.add(s.id);
        fresh.push(s);
      }
    }

    if (!enabled || fresh.length === 0) return;

    for (const signal of fresh) {
      if (signal.status !== "ACTIVE") continue;

      const tf = String(signal.timeframe || "").toUpperCase();
      const tfKey = tf === "D" ? "D" : tf;
      const sentiment = sentimentByTimeframe[tfKey];
      if (!sentiment) continue;

      if (isAligned(signal.type, sentiment.label)) {
        playChime();
        showBrowserNotification(signal, sentiment.label);

        const direction = signal.type === "BUY" ? "Bullish" : "Bearish";
        const tfName = TIMEFRAME_NAMES[signal.timeframe] || signal.timeframe;

        toast({
          title: `Aligned Trade: ${signal.symbol}`,
          description: `${direction} ${tfName} — ${sentiment.label}`,
        });
      }
    }
  }, [signals, sentimentByTimeframe, enabled]);

  return { alertsEnabled: enabled, requestPermission, disable };
}
