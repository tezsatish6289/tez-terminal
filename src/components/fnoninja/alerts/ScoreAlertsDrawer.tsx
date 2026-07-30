"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import { useScoreAlerts } from "@/components/fnoninja/alerts/ScoreAlertsContext";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  SCORE_ALERT_DIRECTIONS,
  SCORE_ALERT_MIN_SCORES,
  SCORE_ALERT_SEGMENTS,
} from "@/lib/alerts/constants";
import { scoreAlertDirectionLabel } from "@/lib/alerts/score-alert-client";
import type {
  ScoreAlertDirection,
  ScoreAlertMinScore,
  ScoreAlertSegment,
} from "@/lib/alerts/types";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import { formatChatUnreadCount } from "@/lib/chat/unread-badge";
import {
  FNO_ACCENT,
  FNO_BG,
  FNO_MUTED,
  FNO_NAV_BORDER,
} from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";

type AlertsTab = "alerts" | "log";

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
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: "#e2e8f0" }}>
          {label}
        </p>
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
        className="relative h-6 w-10 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40"
        style={{ backgroundColor: checked ? "#2563eb" : "rgba(148,163,184,0.28)" }}
      >
        <span
          className="pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150"
          style={{ left: checked ? "1.1rem" : "0.125rem" }}
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
}: {
  label: string;
  options: readonly T[];
  value: T;
  disabled?: boolean;
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: FNO_MUTED }}>
        {label}
      </p>
      <div
        className="flex rounded-lg p-0.5"
        style={{
          backgroundColor: "rgba(6,12,24,0.7)",
          border: `1px solid ${FNO_NAV_BORDER}`,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={String(opt)}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className="min-w-0 flex-1 rounded-md px-1 py-1.5 text-[11px] font-semibold transition-colors disabled:pointer-events-none"
              style={{
                color: active ? "#e2e8f0" : "#94a3b8",
                backgroundColor: active ? "rgba(37,99,235,0.28)" : "transparent",
                border: active ? "1px solid rgba(96,165,250,0.28)" : "1px solid transparent",
              }}
            >
              {format(opt)}
            </button>
          );
        })}
      </div>
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
          <div
            className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5"
            style={{ borderBottom: `1px solid ${FNO_NAV_BORDER}` }}
          >
            <SheetTitle className="flex items-center gap-2 text-[15px] font-semibold text-white m-0">
              <Bell className="h-4 w-4" style={{ color: FNO_ACCENT }} />
              Score alerts
            </SheetTitle>
          </div>

          <div className="px-4 pt-2.5 pb-2">
            <div
              className="flex rounded-lg p-0.5"
              role="tablist"
              aria-label="Score alerts sections"
              style={{
                backgroundColor: "rgba(6,12,24,0.75)",
                border: `1px solid ${FNO_NAV_BORDER}`,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "log"}
                onClick={() => selectTab("log")}
                className="relative flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors"
                style={{
                  color: tab === "log" ? "#e2e8f0" : "#94a3b8",
                  backgroundColor: tab === "log" ? "rgba(37,99,235,0.18)" : "transparent",
                  border: tab === "log" ? "1px solid rgba(96,165,250,0.28)" : "1px solid transparent",
                }}
              >
                Log
                {logBadge ? (
                  <span
                    className="absolute -right-0.5 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
                    style={{ backgroundColor: FNO_ACCENT, boxShadow: `0 0 0 2px ${FNO_BG}` }}
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
                className="flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors"
                style={{
                  color: tab === "alerts" ? "#e2e8f0" : "#94a3b8",
                  backgroundColor: tab === "alerts" ? "rgba(37,99,235,0.18)" : "transparent",
                  border: tab === "alerts" ? "1px solid rgba(96,165,250,0.28)" : "1px solid transparent",
                }}
              >
                Alerts
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {prefsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
              </div>
            ) : tab === "alerts" ? (
              <div className="px-4 pb-5">
                <PrefToggle
                  label="Enable alerts"
                  checked={prefs.enabled}
                  onToggle={(next) => {
                    trackCtaClick("score_alerts_toggle", { enabled: next });
                    void savePrefs({ enabled: next });
                  }}
                />

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
                  value={prefs.minScore}
                  disabled={!prefs.enabled}
                  format={(n: ScoreAlertMinScore) => `≥${n}`}
                  onChange={(minScore) => {
                    trackCtaClick("score_alerts_min_score", { minScore });
                    void savePrefs({ minScore });
                  }}
                />

                <div className="my-1 h-px" style={{ backgroundColor: FNO_NAV_BORDER }} />

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
              <p className="px-4 py-12 text-center text-[13px]" style={{ color: FNO_MUTED }}>
                No alerts yet
              </p>
            ) : (
              <ul>
                {events.map((ev, i) => {
                  const href = levelsChartPagePathForHost(
                    typeof window !== "undefined" ? window.location.hostname : "fnoninja.com",
                    ev.scope,
                    ev.symbol,
                  );
                  const dir = scoreAlertDirectionLabel(ev.side);
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
                        className="flex items-baseline justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
                        style={{
                          borderTop: i === 0 ? undefined : `1px solid ${FNO_NAV_BORDER}`,
                          backgroundColor: unread ? "rgba(37,99,235,0.06)" : "transparent",
                        }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-white">
                            {ev.label || ev.symbol}{" "}
                            <span style={{ color: ev.side === "support" ? "#86efac" : "#fca5a5" }}>
                              {dir}
                            </span>
                          </p>
                          <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: "#94a3b8" }}>
                            {ev.score} ≥{ev.minScore}
                            {ev.probabilityPct > 0 ? ` · ~${ev.probabilityPct}%` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] tabular-nums" style={{ color: FNO_MUTED }}>
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

/** Nav / toolbar bell button. */
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
