"use client";

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

function PrefToggle({
  label,
  title,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <p className="text-[13px] font-medium text-white truncate" title={title}>
        {label}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className="relative h-6 w-10 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40"
        style={{ backgroundColor: checked ? "#2563eb" : "rgba(148,163,184,0.35)" }}
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
  title,
  options,
  value,
  disabled,
  format,
  onChange,
}: {
  label: string;
  title?: string;
  options: readonly T[];
  value: T;
  disabled?: boolean;
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <p
        className="w-[4.5rem] shrink-0 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: FNO_MUTED }}
        title={title}
      >
        {label}
      </p>
      <div className="flex min-w-0 flex-1 gap-1">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={String(opt)}
              type="button"
              disabled={disabled}
              title={title}
              onClick={() => onChange(opt)}
              className="min-w-0 flex-1 rounded-md px-1 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
              style={{
                color: active ? "#fff" : "#94a3b8",
                backgroundColor: active
                  ? "rgba(37,99,235,0.55)"
                  : "rgba(15,23,42,0.65)",
                border: `1px solid ${
                  active ? "rgba(96,165,250,0.5)" : "rgba(90,140,220,0.12)"
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
  if (d === "bullish") return "Bull";
  if (d === "bearish") return "Bear";
  return "Both";
}

function segmentLabel(s: ScoreAlertSegment): string {
  if (s === "favslide") return "Fav";
  if (s === "liveslide") return "Live";
  return "Both";
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
          <SheetHeader className="px-4 pt-3 pb-2 border-b space-y-0" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
            <SheetTitle className="flex items-center gap-2 text-white text-[15px]">
              <Bell className="h-4 w-4" style={{ color: FNO_ACCENT }} />
              Score alerts
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {prefsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
              </div>
            ) : (
              <>
                <PrefToggle
                  label="Enabled"
                  title="Watched during market hours"
                  checked={prefs.enabled}
                  onToggle={(next) => {
                    trackCtaClick("score_alerts_toggle", { enabled: next });
                    void savePrefs({ enabled: next });
                  }}
                />

                <div
                  className="my-1.5 space-y-0.5 rounded-lg px-2.5 py-1"
                  style={{
                    border: "1px solid rgba(90,140,220,0.1)",
                    backgroundColor: "rgba(15,23,42,0.35)",
                    opacity: prefs.enabled ? 1 : 0.55,
                  }}
                >
                  <ChoiceRow
                    label="Segment"
                    title="Fav = watchlist · Live = at/near zone · Both = union"
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
                    label="Side"
                    title="Bull = support ↑ · Bear = resistance ↓"
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
                    label="Score"
                    options={SCORE_ALERT_MIN_SCORES}
                    value={prefs.minScore}
                    disabled={!prefs.enabled}
                    format={(n: ScoreAlertMinScore) => `≥${n}`}
                    onChange={(minScore) => {
                      trackCtaClick("score_alerts_min_score", { minScore });
                      void savePrefs({ minScore });
                    }}
                  />
                </div>

                <PrefToggle
                  label="Chime"
                  title="Soft sound when the app is open"
                  checked={prefs.chime}
                  disabled={!prefs.enabled}
                  onToggle={(next) => void savePrefs({ chime: next })}
                />
                <PrefToggle
                  label="Browser notify"
                  title={
                    browserUnsupported
                      ? "Not supported in this browser"
                      : browserDenied
                        ? "Blocked in browser settings — allow for this site, then turn on again"
                        : "Notify when the tab is in the background"
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
                {browserDenied ? (
                  <p className="pb-1 text-[10px] leading-snug" style={{ color: "#fbbf24" }}>
                    Notifications blocked in browser settings
                  </p>
                ) : null}

                <div className="mt-2 mb-1.5 h-px" style={{ backgroundColor: "rgba(90,140,220,0.12)" }} />

                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: FNO_MUTED }}>
                  Recent
                </p>

                {events.length === 0 ? (
                  <p className="py-4 text-center text-[12px]" style={{ color: FNO_MUTED }}>
                    No alerts yet
                  </p>
                ) : (
                  <ul className="space-y-1.5 pb-4">
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
                            className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                            style={{
                              border: "1px solid rgba(90,140,220,0.12)",
                              backgroundColor: ev.readAt
                                ? "transparent"
                                : "rgba(37,99,235,0.08)",
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[13px] font-semibold text-white">
                                {ev.label || ev.symbol}{" "}
                                <span style={{ color: ev.side === "support" ? "#86efac" : "#fca5a5" }}>
                                  {dir}
                                </span>
                              </p>
                              <span className="shrink-0 text-[10px] tabular-nums" style={{ color: FNO_MUTED }}>
                                {formatAlertTime(ev.at)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px]" style={{ color: "#94a3b8" }}>
                              {ev.score} ≥{ev.minScore}
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
