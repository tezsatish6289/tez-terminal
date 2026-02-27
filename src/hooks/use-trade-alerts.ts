"use client";

import { useRef, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { useTradeAlertsContext, type TradeAlert } from "@/contexts/trade-alerts-context";
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
 * market (or bearish during bearish), fires a browser push notification,
 * plays an ascending chime, and logs the alert to history.
 */
export function useTradeAlerts(
  signals: AlertableSignal[] | null,
  sentimentByTimeframe: Record<string, SentimentResult>,
) {
  const { enabled, addAlert } = useTradeAlertsContext();
  const seenRef = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);

  useEffect(() => {
    if (!signals || signals.length === 0) return;

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
        const direction = signal.type === "BUY" ? "Bullish" : "Bearish";
        const tfName = TIMEFRAME_NAMES[signal.timeframe] || signal.timeframe;

        playChime();
        showBrowserNotification(signal, sentiment.label);

        addAlert({
          id: signal.id,
          symbol: signal.symbol,
          direction: direction as "Bullish" | "Bearish",
          timeframeName: tfName,
          sentimentLabel: sentiment.label,
          timestamp: Date.now(),
        });

        toast({
          title: `Aligned Trade: ${signal.symbol}`,
          description: `${direction} ${tfName} — ${sentiment.label}`,
        });
      }
    }
  }, [signals, sentimentByTimeframe, enabled, addAlert]);
}
