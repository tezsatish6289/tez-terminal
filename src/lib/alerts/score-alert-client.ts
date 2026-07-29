/** Client-safe helpers for score alerts (no server-only imports). */

import {
  LIVE_SCORE_ALERTS_RTDB_PATH,
  SCORE_ALERT_FRESH_MS,
  SCORE_ALERT_READ_KEY_PREFIX,
} from "@/lib/alerts/constants";
import type { LiveScoreAlert, ScoreAlertSide } from "@/lib/alerts/types";

export { LIVE_SCORE_ALERTS_RTDB_PATH, SCORE_ALERT_FRESH_MS };

export function scoreAlertsRtdbPath(uid: string): string {
  return `${LIVE_SCORE_ALERTS_RTDB_PATH}/${uid}`;
}

export function isScoreAlertFresh(atIso: string, now = Date.now()): boolean {
  const t = Date.parse(atIso);
  if (!Number.isFinite(t)) return false;
  return now - t <= SCORE_ALERT_FRESH_MS;
}

function seenKey(uid: string): string {
  return `${SCORE_ALERT_READ_KEY_PREFIX}${uid}`;
}

export function readSeenScoreAlertIds(uid: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(seenKey(uid));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function rememberSeenScoreAlertId(uid: string, id: string): void {
  if (typeof window === "undefined") return;
  const set = readSeenScoreAlertIds(uid);
  set.add(id);
  const list = [...set].slice(-100);
  try {
    localStorage.setItem(seenKey(uid), JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function parseLiveScoreAlert(val: unknown): LiveScoreAlert | null {
  if (!val || typeof val !== "object") return null;
  const o = val as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.symbol !== "string" || typeof o.at !== "string") {
    return null;
  }
  const scope = o.scope === "index" ? "index" : o.scope === "stock" ? "stock" : null;
  const side: ScoreAlertSide | null =
    o.side === "support" || o.side === "resistance" ? o.side : null;
  if (!scope || !side) return null;
  const score = typeof o.score === "number" ? o.score : Number(o.score);
  const minScore = typeof o.minScore === "number" ? o.minScore : Number(o.minScore);
  const probabilityPct =
    typeof o.probabilityPct === "number" ? o.probabilityPct : Number(o.probabilityPct);
  if (!Number.isFinite(score) || !Number.isFinite(minScore)) return null;
  return {
    id: o.id,
    symbol: o.symbol,
    label: typeof o.label === "string" ? o.label : o.symbol,
    scope,
    side,
    score: Math.round(score),
    minScore: (minScore === 60 || minScore === 70 || minScore === 80 ? minScore : 70) as 60 | 70 | 80,
    probabilityPct: Number.isFinite(probabilityPct) ? Math.round(probabilityPct) : 0,
    at: o.at,
  };
}

export function scoreAlertDirectionLabel(side: ScoreAlertSide): string {
  return side === "support" ? "↑" : "↓";
}

export function playScoreAlertChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, start: 0, dur: 0.22, vol: 0.22 },
      { freq: 880, start: 0.14, dur: 0.28, vol: 0.2 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = n.freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* autoplay / unsupported */
  }
}

export function showScoreAlertBrowserNotification(alert: LiveScoreAlert): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const dir = scoreAlertDirectionLabel(alert.side);
  try {
    new Notification(`${alert.label || alert.symbol} ${dir} score ${alert.score}`, {
      body: `Atlas setup crossed ${alert.minScore}+ (~${alert.probabilityPct}% win rate)`,
      tag: `score-alert-${alert.id}`,
      requireInteraction: false,
    });
  } catch {
    /* unavailable */
  }
}
