"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Crown, Loader2 } from "lucide-react";
import { useScoreAlerts } from "@/components/fnoninja/alerts/ScoreAlertsContext";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import { FnoNinjaIntentUpgradeNudge } from "@/components/fnoninja/FnoNinjaIntentUpgradeNudge";
import { useUpgradePrompt } from "@/components/fnoninja/FnoNinjaUpgradePrompt";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  SCORE_ALERT_DIRECTIONS,
  SCORE_ALERT_GOLD_MIN_SCORE,
  SCORE_ALERT_MIN_SCORES,
  SCORE_ALERT_SEGMENTS,
  SCORE_ALERT_STANDARD_MAX_MIN_SCORE,
} from "@/lib/alerts/constants";
import type {
  ScoreAlertDirection,
  ScoreAlertMinScore,
  ScoreAlertSegment,
  ScoreAlertSide,
} from "@/lib/alerts/types";
import { useEntitlements } from "@/hooks/use-entitlements";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import { formatChatUnreadCount } from "@/lib/chat/unread-badge";
import { fnoCompanyName } from "@/lib/nse/fno-company-names";
import {
  FNO_ACCENT,
  FNO_BG,
  FNO_MUTED,
  FNO_NAV_BORDER,
} from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";

type AlertsTab = "alerts" | "log";

const SURFACE = "#0d1830";
const SURFACE_SOFT = "rgba(13,24,48,0.9)";
const PILL_TRACK = "rgba(8,15,30,0.95)";
const ACTIVE_BLUE = "#2563eb";
const ACTIVE_BLUE_SOFT = "rgba(37,99,235,0.85)";

function PrefToggle({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-snug" style={{ color: FNO_MUTED }}>
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className="relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40"
        style={{ backgroundColor: checked ? ACTIVE_BLUE : "rgba(148,163,184,0.3)" }}
      >
        <span
          className="pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-150"
          style={{ left: checked ? "1.35rem" : "0.15rem" }}
        />
      </button>
    </div>
  );
}

function ChoiceRow<T extends string | number>({
  label,
  options,
  value,
  disabled,
  format,
  onChange,
  isLocked,
  onLockedClick,
  lockedHint,
}: {
  label: string;
  options: readonly T[];
  value: T;
  disabled?: boolean;
  format: (v: T) => string;
  onChange: (v: T) => void;
  isLocked?: (v: T) => boolean;
  onLockedClick?: (v: T) => void;
  lockedHint?: string;
}) {
  return (
    <div className="py-2">
      <p
        className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: FNO_MUTED }}
      >
        {label}
      </p>
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{
          backgroundColor: PILL_TRACK,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {options.map((opt) => {
          const active = value === opt;
          const locked = Boolean(isLocked?.(opt));
          return (
            <button
              key={String(opt)}
              type="button"
              disabled={disabled && !locked}
              onClick={() => {
                if (locked) {
                  onLockedClick?.(opt);
                  return;
                }
                if (disabled) return;
                onChange(opt);
              }}
              className="relative min-w-0 flex-1 rounded-lg px-1 py-2 text-[12px] font-semibold transition-colors"
              style={{
                color: locked ? "#fbbf24" : active ? "#fff" : "#94a3b8",
                backgroundColor: active && !locked ? ACTIVE_BLUE_SOFT : "transparent",
                opacity: locked ? 0.9 : 1,
              }}
              title={locked ? lockedHint : undefined}
              aria-label={locked ? `${format(opt)}, Gold` : format(opt)}
            >
              <span className="inline-flex items-center justify-center gap-0.5">
                {locked ? <Crown className="h-3 w-3 shrink-0" /> : null}
                {format(opt)}
              </span>
            </button>
          );
        })}
      </div>
      {lockedHint && options.some((o) => isLocked?.(o)) ? (
        <p className="mt-1.5 text-[10px] leading-snug" style={{ color: FNO_MUTED }}>
          {lockedHint}
        </p>
      ) : null}
    </div>
  );
}

function formatAlertTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(t));
  } catch {
    return new Date(t).toLocaleString();
  }
}

function directionLabel(d: ScoreAlertDirection): string {
  if (d === "bullish") return "Bullish";
  if (d === "bearish") return "Bearish";
  return "Both";
}

function segmentLabel(s: ScoreAlertSegment): string {
  if (s === "favslide") return "Favslide";
  if (s === "liveslide") return "Liveslide";
  return "Both";
}

function titleCaseWords(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function alertDisplayName(symbol: string, label?: string | null): string {
  const company = fnoCompanyName(symbol);
  if (company) return titleCaseWords(company);
  const raw = (label?.trim() || symbol).trim();
  if (!raw) return symbol;
  if (raw.toUpperCase() === raw) return titleCaseWords(raw);
  return raw;
}

function arrowGlyph(side: ScoreAlertSide): string {
  return side === "support" ? "↑" : "↓";
}

export function ScoreAlertsDrawer() {
  const {
    prefs,
    prefsLoading,
    events,
    unreadCount,
    drawerOpen,
    setDrawerOpen,
    notificationPermission,
    savePrefs,
    enableBrowserNotifications,
    markAllRead,
  } = useScoreAlerts();
  const { has: hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { promptUpgrade } = useUpgradePrompt();
  const canUseGoldFloor = hasFeature("score_alerts_80");

  const [tab, setTab] = useState<AlertsTab>("log");
  const browserDenied = notificationPermission === "denied";
  const browserUnsupported = notificationPermission === "unsupported";

  useEffect(() => {
    if (!drawerOpen) return;
    setTab("log");
  }, [drawerOpen]);

  useEffect(() => {
    if (drawerOpen && tab === "log") {
      void markAllRead();
    }
  }, [drawerOpen, tab, markAllRead]);

  // Persist clamp if a non-Gold tier still has ≥80 stored from an older session.
  useEffect(() => {
    if (prefsLoading || entitlementsLoading || canUseGoldFloor) return;
    if (prefs.minScore < SCORE_ALERT_GOLD_MIN_SCORE) return;
    void savePrefs({ minScore: SCORE_ALERT_STANDARD_MAX_MIN_SCORE });
  }, [
    prefsLoading,
    entitlementsLoading,
    canUseGoldFloor,
    prefs.minScore,
    savePrefs,
  ]);

  const selectTab = (next: AlertsTab) => {
    trackCtaClick("score_alerts_tab", { tab: next });
    setTab(next);
  };

  const logBadge = formatChatUnreadCount(unreadCount);

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-hidden border-l p-0 z-[210] !top-14 sm:!top-16 !bottom-0 !h-[calc(100dvh-3.5rem)] sm:!h-[calc(100dvh-4rem)] max-h-none"
        style={{ backgroundColor: FNO_BG, borderColor: FNO_NAV_BORDER }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
            <Bell className="h-4 w-4 shrink-0" style={{ color: FNO_ACCENT }} />
            <SheetTitle className="m-0 text-[16px] font-semibold tracking-tight text-white">
              Score alerts
            </SheetTitle>
          </div>

          <div className="px-4 pb-3">
            <div
              className="flex rounded-full p-1"
              role="tablist"
              aria-label="Score alerts sections"
              style={{ backgroundColor: PILL_TRACK }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "log"}
                onClick={() => selectTab("log")}
                className="relative flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors"
                style={{
                  color: "#fff",
                  backgroundColor: tab === "log" ? ACTIVE_BLUE : "transparent",
                }}
              >
                Log
                {logBadge ? (
                  <span
                    className="absolute right-2 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
                    style={{ backgroundColor: "#ef4444" }}
                  >
                    {logBadge}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "alerts"}
                onClick={() => selectTab("alerts")}
                className="flex-1 rounded-full py-2 text-[13px] font-semibold transition-colors"
                style={{
                  color: "#fff",
                  backgroundColor: tab === "alerts" ? ACTIVE_BLUE : "transparent",
                }}
              >
                Alerts
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-5">
            {prefsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
              </div>
            ) : tab === "alerts" ? (
              <div
                className="rounded-2xl px-3.5 py-1"
                style={{ backgroundColor: SURFACE }}
              >
                <PrefToggle
                  label="Enable alerts"
                  checked={prefs.enabled}
                  onToggle={(next) => {
                    trackCtaClick("score_alerts_toggle", { enabled: next });
                    void savePrefs({ enabled: next });
                  }}
                />

                {prefs.enabled ? (
                  <div className="pb-3 pt-1">
                    <FnoNinjaIntentUpgradeNudge reason="alerts_enabled" />
                  </div>
                ) : null}

                <ChoiceRow
                  label="Segment"
                  options={SCORE_ALERT_SEGMENTS}
                  value={prefs.segment}
                  disabled={!prefs.enabled}
                  format={segmentLabel}
                  onChange={(segment) => {
                    trackCtaClick("score_alerts_segment", { segment });
                    void savePrefs({ segment });
                  }}
                />

                <ChoiceRow
                  label="Direction"
                  options={SCORE_ALERT_DIRECTIONS}
                  value={prefs.direction}
                  disabled={!prefs.enabled}
                  format={directionLabel}
                  onChange={(direction) => {
                    trackCtaClick("score_alerts_direction", { direction });
                    void savePrefs({ direction });
                  }}
                />

                <ChoiceRow
                  label="Score floor"
                  options={SCORE_ALERT_MIN_SCORES}
                  value={
                    canUseGoldFloor
                      ? prefs.minScore
                      : Math.min(prefs.minScore, SCORE_ALERT_STANDARD_MAX_MIN_SCORE) as ScoreAlertMinScore
                  }
                  disabled={!prefs.enabled}
                  format={(n: ScoreAlertMinScore) => `≥${n}`}
                  isLocked={(n) => n >= SCORE_ALERT_GOLD_MIN_SCORE && !canUseGoldFloor}
                  lockedHint="A+ setup alerts (≥80) are a Gold feature"
                  onLockedClick={() => {
                    trackCtaClick("score_alerts_min_score_locked", { minScore: 80 });
                    promptUpgrade("score_alerts_80");
                  }}
                  onChange={(minScore) => {
                    trackCtaClick("score_alerts_min_score", { minScore });
                    void savePrefs({ minScore });
                  }}
                />

                <PrefToggle
                  label="Chime"
                  checked={prefs.chime}
                  disabled={!prefs.enabled}
                  onToggle={(next) => void savePrefs({ chime: next })}
                />

                <PrefToggle
                  label="Browser notifications"
                  description={
                    browserDenied
                      ? "Blocked in browser settings — allow for this site, then turn on again."
                      : undefined
                  }
                  checked={prefs.browserNotifications && notificationPermission === "granted"}
                  disabled={!prefs.enabled || browserUnsupported}
                  onToggle={(next) => {
                    if (!next) {
                      void savePrefs({ browserNotifications: false });
                      return;
                    }
                    if (notificationPermission === "granted") {
                      void savePrefs({ browserNotifications: true });
                      return;
                    }
                    if (browserDenied) {
                      void savePrefs({ browserNotifications: true });
                      return;
                    }
                    void enableBrowserNotifications();
                  }}
                />
              </div>
            ) : events.length === 0 ? (
              <p className="py-14 text-center text-[13px]" style={{ color: FNO_MUTED }}>
                No alerts yet
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => {
                  const href = levelsChartPagePathForHost(
                    typeof window !== "undefined" ? window.location.hostname : "fnoninja.com",
                    ev.scope,
                    ev.symbol,
                  );
                  const name = alertDisplayName(ev.symbol, ev.label);
                  const unread = !ev.readAt;
                  return (
                    <li key={ev.id}>
                      <Link
                        href={href}
                        onClick={() => {
                          trackCtaClick("score_alert_open_chart", {
                            symbol: ev.symbol,
                            score: ev.score,
                          });
                          setDrawerOpen(false);
                        }}
                        className="flex items-start justify-between gap-3 rounded-2xl px-3.5 py-3 transition-colors hover:brightness-110"
                        style={{
                          backgroundColor: unread ? "rgba(37,99,235,0.16)" : SURFACE_SOFT,
                        }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-white">
                            {name}{" "}
                            <span style={{ color: ev.side === "support" ? "#4ade80" : "#f87171" }}>
                              {arrowGlyph(ev.side)}
                            </span>
                          </p>
                          <p className="mt-1 text-[12px] leading-snug" style={{ color: "#94a3b8" }}>
                            Score: {ev.score}, Probability: {ev.probabilityPct}%
                          </p>
                        </div>
                        <span
                          className="shrink-0 pt-0.5 text-[11px] tabular-nums"
                          style={{ color: FNO_MUTED }}
                        >
                          {formatAlertTime(ev.at)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ScoreAlertsBellButton({
  className = "",
  iconClassName = "h-5 w-5",
}: {
  className?: string;
  iconClassName?: string;
}) {
  const { unreadCount, setDrawerOpen } = useScoreAlerts();

  return (
    <button
      type="button"
      onClick={() => {
        trackCtaClick("score_alerts_open", { unreadCount });
        setDrawerOpen(true);
      }}
      className={`relative flex items-center justify-center shrink-0 transition-colors hover:text-white ${className}`}
      style={{ color: "#94a3b8" }}
      aria-label={unreadCount > 0 ? `Score alerts, ${unreadCount} unread` : "Score alerts"}
      title="Score alerts"
    >
      <Bell className={iconClassName} strokeWidth={1.5} />
      {unreadCount > 0 ? (
        <ChatUnreadBadge count={unreadCount} className="absolute -right-1 -top-1" />
      ) : null}
    </button>
  );
}
