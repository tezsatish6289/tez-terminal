"use client";

import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import { useScoreAlerts } from "@/components/fnoninja/alerts/ScoreAlertsContext";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SCORE_ALERT_MIN_SCORES } from "@/lib/alerts/constants";
import { scoreAlertDirectionLabel } from "@/lib/alerts/score-alert-client";
import type { ScoreAlertMinScore } from "@/lib/alerts/types";
import { levelsChartPagePathForHost } from "@/lib/levels/levels-chart-url";
import { FNO_ACCENT, FNO_BG_CANVAS, FNO_MUTED } from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";

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
    <div className="flex items-start justify-between gap-3 py-3">
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
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60"
        style={{ backgroundColor: checked ? "#2563eb" : "rgba(148,163,184,0.35)" }}
      >
        <span
          className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
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

export function ScoreAlertsDrawer() {
  const {
    prefs,
    prefsLoading,
    events,
    drawerOpen,
    setDrawerOpen,
    notificationPermission,
    savePrefs,
    enableBrowserNotifications,
  } = useScoreAlerts();

  const browserDenied = notificationPermission === "denied";
  const browserUnsupported = notificationPermission === "unsupported";

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-hidden border-l p-0 z-[210] !top-14 sm:!top-16 !bottom-0 !h-[calc(100dvh-3.5rem)] sm:!h-[calc(100dvh-4rem)] max-h-none"
        style={{ backgroundColor: FNO_BG_CANVAS, borderColor: "rgba(90,140,220,0.12)" }}
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 border-b space-y-1" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
            <SheetTitle className="flex items-center gap-2 text-white text-base">
              <Bell className="h-4 w-4" style={{ color: FNO_ACCENT }} />
              Score alerts
            </SheetTitle>
            <SheetDescription className="text-[12px]" style={{ color: FNO_MUTED }}>
              Get notified when a favslide symbol crosses your Atlas score floor.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {prefsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
              </div>
            ) : (
              <>
                <PrefToggle
                  label="Enable alerts"
                  description="Watches your favslide list during market hours."
                  checked={prefs.enabled}
                  onToggle={(next) => {
                    trackCtaClick("score_alerts_toggle", { enabled: next });
                    void savePrefs({ enabled: next });
                  }}
                />

                <div className="pb-3">
                  <p className="text-sm font-semibold text-white mb-2">Score floor</p>
                  <div className="flex gap-2">
                    {SCORE_ALERT_MIN_SCORES.map((n: ScoreAlertMinScore) => {
                      const active = prefs.minScore === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          disabled={!prefs.enabled}
                          onClick={() => {
                            trackCtaClick("score_alerts_min_score", { minScore: n });
                            void savePrefs({ minScore: n });
                          }}
                          className="flex-1 rounded-lg py-2 text-sm font-bold tabular-nums transition-colors disabled:opacity-40"
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
                          ≥{n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <PrefToggle
                  label="Chime"
                  description="Soft sound when the app is open."
                  checked={prefs.chime}
                  disabled={!prefs.enabled}
                  onToggle={(next) => void savePrefs({ chime: next })}
                />

                <PrefToggle
                  label="Browser notifications"
                  description={
                    browserUnsupported
                      ? "Not supported in this browser."
                      : browserDenied
                        ? "Blocked in browser settings — allow notifications for this site, then turn this on again."
                        : notificationPermission === "granted"
                          ? "Shows a system notification when an alert fires."
                          : "Ask for permission to notify when the tab is in the background."
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
                      // Keep toggle visible; user must fix OS/browser settings first.
                      void savePrefs({ browserNotifications: true });
                      return;
                    }
                    void enableBrowserNotifications();
                  }}
                />

                <div className="mt-2 mb-3 h-px" style={{ backgroundColor: "rgba(90,140,220,0.12)" }} />

                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: FNO_MUTED }}>
                    Recent
                  </p>
                </div>

                {events.length === 0 ? (
                  <p className="text-[13px] py-6 text-center" style={{ color: FNO_MUTED }}>
                    No alerts yet. Add symbols to favslide and keep alerts enabled.
                  </p>
                ) : (
                  <ul className="space-y-2">
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
                            className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
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
              </>
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
