"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import { useScoreAlerts } from "@/components/fnoninja/alerts/ScoreAlertsContext";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { FNO_ACCENT, FNO_BG_CANVAS, FNO_MUTED } from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";
import { formatChatUnreadCount } from "@/lib/chat/unread-badge";

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
        <p className="text-sm font-semibold text-white">{label}</p>
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
        className="relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-60"
        style={{ backgroundColor: checked ? "#2563eb" : "rgba(148,163,184,0.35)" }}
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
      <p className="mb-1.5 text-sm font-semibold text-white">{label}</p>
      <div className="flex gap-1.5">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={String(opt)}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className="flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors disabled:opacity-40"
              style={{
                color: active ? "#fff" : "#94a3b8",
                backgroundColor: active
                  ? "rgba(37,99,235,0.55)"
                  : "rgba(15,23,42,0.65)",
                border: `1px solid ${
                  active ? "rgba(96,165,250,0.55)" : "rgba(90,140,220,0.15)"
                }`,
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

function AlertsLogTab({
  active,
  unreadCount,
  onSelect,
}: {
  active: boolean;
  unreadCount: number;
  onSelect: () => void;
}) {
  const badge = formatChatUnreadCount(unreadCount);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className="relative flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors"
      style={{
        color: active ? "#f1f5f9" : "#94a3b8",
        backgroundColor: active ? "rgba(51,65,85,0.95)" : "transparent",
      }}
    >
      Log
      {badge ? (
        <span
          className="absolute -right-0.5 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
          style={{
            height: 16,
            backgroundColor: "#ef4444",
            boxShadow: "0 0 0 2px rgba(8,15,30,0.95)",
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
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

  const [tab, setTab] = useState<AlertsTab>("alerts");
  const browserDenied = notificationPermission === "denied";
  const browserUnsupported = notificationPermission === "unsupported";

  // Open on Log when there are unread alerts; otherwise stay on Alerts.
  useEffect(() => {
    if (!drawerOpen) return;
    setTab(unreadCount > 0 ? "log" : "alerts");
  }, [drawerOpen]); // eslint-disable-line react-hooks/exhaustive-deps -- only on open

  useEffect(() => {
    if (drawerOpen && tab === "log") {
      void markAllRead();
    }
  }, [drawerOpen, tab, markAllRead]);

  const selectTab = (next: AlertsTab) => {
    trackCtaClick("score_alerts_tab", { tab: next });
    setTab(next);
  };

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-hidden border-l p-0 z-[210] !top-14 sm:!top-16 !bottom-0 !h-[calc(100dvh-3.5rem)] sm:!h-[calc(100dvh-4rem)] max-h-none"
        style={{ backgroundColor: FNO_BG_CANVAS, borderColor: "rgba(90,140,220,0.12)" }}
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="px-4 pt-3.5 pb-2.5 space-y-2.5" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
            <SheetTitle className="flex items-center gap-2 text-white text-base">
              <Bell className="h-4 w-4" style={{ color: FNO_ACCENT }} />
              Score alerts
            </SheetTitle>
            <div
              className="flex rounded-lg p-0.5"
              role="tablist"
              aria-label="Score alerts sections"
              style={{ backgroundColor: "rgba(15,23,42,0.85)", border: "1px solid rgba(90,140,220,0.12)" }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "alerts"}
                onClick={() => selectTab("alerts")}
                className="flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors"
                style={{
                  color: tab === "alerts" ? "#f1f5f9" : "#94a3b8",
                  backgroundColor: tab === "alerts" ? "rgba(51,65,85,0.95)" : "transparent",
                }}
              >
                Alerts
              </button>
              <AlertsLogTab
                active={tab === "log"}
                unreadCount={unreadCount}
                onSelect={() => selectTab("log")}
              />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-5 pt-1">
            {prefsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
              </div>
            ) : tab === "alerts" ? (
              <>
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
              </>
            ) : events.length === 0 ? (
              <p className="py-10 text-center text-[13px]" style={{ color: FNO_MUTED }}>
                No alerts yet
              </p>
            ) : (
              <ul className="space-y-1.5 pt-1">
                {events.map((ev) => {
                  const href = levelsChartPagePathForHost(
                    typeof window !== "undefined" ? window.location.hostname : "fnoninja.com",
                    ev.scope,
                    ev.symbol,
                  );
                  const dir = scoreAlertDirectionLabel(ev.side);
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
                        className="block rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]"
                        style={{
                          border: "1px solid rgba(90,140,220,0.12)",
                          backgroundColor: ev.readAt
                            ? "transparent"
                            : "rgba(37,99,235,0.08)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white truncate">
                            {ev.label || ev.symbol}{" "}
                            <span style={{ color: ev.side === "support" ? "#86efac" : "#fca5a5" }}>
                              {dir}
                            </span>
                          </p>
                          <span className="text-[11px] tabular-nums shrink-0" style={{ color: FNO_MUTED }}>
                            {formatAlertTime(ev.at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px]" style={{ color: "#94a3b8" }}>
                          Score {ev.score} ≥{ev.minScore}
                          {ev.probabilityPct > 0 ? ` · ~${ev.probabilityPct}%` : ""}
                        </p>
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
