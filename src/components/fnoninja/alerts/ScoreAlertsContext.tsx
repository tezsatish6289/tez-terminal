"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { off, onChildAdded, orderByChild, query, ref, startAt } from "firebase/database";
import { useUser } from "@/firebase";
import { initializeFirebase } from "@/firebase";
import { DEFAULT_SCORE_ALERT_PREFERENCES } from "@/lib/alerts/constants";
import {
  isScoreAlertFresh,
  parseLiveScoreAlert,
  playScoreAlertChime,
  readSeenScoreAlertIds,
  rememberSeenScoreAlertId,
  scoreAlertsRtdbPath,
  showScoreAlertBrowserNotification,
} from "@/lib/alerts/score-alert-client";
import type { ScoreAlertEvent, ScoreAlertPreferences } from "@/lib/alerts/types";

type ScoreAlertsContextValue = {
  prefs: ScoreAlertPreferences;
  prefsLoading: boolean;
  events: ScoreAlertEvent[];
  unreadCount: number;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  notificationPermission: NotificationPermission | "unsupported";
  savePrefs: (patch: Partial<ScoreAlertPreferences>) => Promise<boolean>;
  enableBrowserNotifications: () => Promise<boolean>;
  refreshEvents: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const ScoreAlertsContext = createContext<ScoreAlertsContextValue | null>(null);

async function authHeaders(user: { getIdToken: () => Promise<string> }) {
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function ScoreAlertsProvider({ children }: { children: ReactNode }) {
  const { user, isUserLoading } = useUser();
  const [prefs, setPrefs] = useState<ScoreAlertPreferences>(DEFAULT_SCORE_ALERT_PREFERENCES);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [events, setEvents] = useState<ScoreAlertEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const seenRef = useRef<Set<string>>(new Set());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  const refreshEvents = useCallback(async () => {
    if (!user) {
      setEvents([]);
      setUnreadCount(0);
      return;
    }
    try {
      const headers = await authHeaders(user);
      const res = await fetch("/api/fnoninja/alerts/events", {
        headers: { Authorization: headers.Authorization },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        events?: ScoreAlertEvent[];
        unreadCount?: number;
      };
      setEvents(Array.isArray(data.events) ? data.events : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      /* ignore */
    }
  }, [user]);

  const loadPrefs = useCallback(async () => {
    if (!user) {
      setPrefs(DEFAULT_SCORE_ALERT_PREFERENCES);
      return;
    }
    setPrefsLoading(true);
    try {
      const headers = await authHeaders(user);
      const res = await fetch("/api/fnoninja/alerts/preferences", {
        headers: { Authorization: headers.Authorization },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { preferences?: ScoreAlertPreferences };
      if (data.preferences) setPrefs(data.preferences);
    } catch {
      /* ignore */
    } finally {
      setPrefsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isUserLoading) return;
    void loadPrefs();
    void refreshEvents();
  }, [isUserLoading, loadPrefs, refreshEvents]);

  useEffect(() => {
    if (!user) {
      seenRef.current = new Set();
      return;
    }
    seenRef.current = readSeenScoreAlertIds(user.uid);
  }, [user]);

  // Live RTDB fanout
  useEffect(() => {
    if (!user) return;
    const { database } = initializeFirebase();
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const q = query(
      ref(database, scoreAlertsRtdbPath(user.uid)),
      orderByChild("at"),
      startAt(sinceIso),
    );

    const handle = onChildAdded(q, (snap) => {
      const alert = parseLiveScoreAlert(snap.val());
      if (!alert) return;
      if (seenRef.current.has(alert.id)) return;
      seenRef.current.add(alert.id);
      rememberSeenScoreAlertId(user.uid, alert.id);
      if (!isScoreAlertFresh(alert.at)) return;

      const asEvent: ScoreAlertEvent = { ...alert, readAt: null };
      setEvents((prev) => {
        if (prev.some((e) => e.id === alert.id)) return prev;
        return [asEvent, ...prev].slice(0, 40);
      });
      setUnreadCount((n) => n + 1);

      const p = prefsRef.current;
      if (p.chime) playScoreAlertChime();
      if (p.browserNotifications) showScoreAlertBrowserNotification(alert);
    });

    return () => {
      off(q, "child_added", handle);
    };
  }, [user]);

  const savePrefs = useCallback(
    async (patch: Partial<ScoreAlertPreferences>) => {
      if (!user) return false;
      const optimistic = { ...prefsRef.current, ...patch, updatedAt: new Date().toISOString() };
      setPrefs(optimistic);
      try {
        const headers = await authHeaders(user);
        const res = await fetch("/api/fnoninja/alerts/preferences", {
          method: "PUT",
          headers,
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          await loadPrefs();
          return false;
        }
        const data = (await res.json()) as { preferences?: ScoreAlertPreferences };
        if (data.preferences) setPrefs(data.preferences);
        return true;
      } catch {
        await loadPrefs();
        return false;
      }
    },
    [user, loadPrefs],
  );

  const enableBrowserNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === "granted") {
        await savePrefs({ browserNotifications: true });
        return true;
      }
      await savePrefs({ browserNotifications: false });
      return false;
    } catch {
      return false;
    }
  }, [savePrefs]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setEvents((prev) =>
      prev.map((e) => (e.readAt ? e : { ...e, readAt: new Date().toISOString() })),
    );
    setUnreadCount(0);
    try {
      const headers = await authHeaders(user);
      await fetch("/api/fnoninja/alerts/events", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "mark_all_read" }),
      });
    } catch {
      /* ignore */
    }
  }, [user]);

  const handleSetDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (open && typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const value = useMemo<ScoreAlertsContextValue>(
    () => ({
      prefs,
      prefsLoading,
      events,
      unreadCount,
      drawerOpen,
      setDrawerOpen: handleSetDrawerOpen,
      notificationPermission,
      savePrefs,
      enableBrowserNotifications,
      refreshEvents,
      markAllRead,
    }),
    [
      prefs,
      prefsLoading,
      events,
      unreadCount,
      drawerOpen,
      handleSetDrawerOpen,
      notificationPermission,
      savePrefs,
      enableBrowserNotifications,
      refreshEvents,
      markAllRead,
    ],
  );

  return (
    <ScoreAlertsContext.Provider value={value}>{children}</ScoreAlertsContext.Provider>
  );
}

export function useScoreAlerts(): ScoreAlertsContextValue {
  const ctx = useContext(ScoreAlertsContext);
  if (!ctx) {
    throw new Error("useScoreAlerts must be used within ScoreAlertsProvider");
  }
  return ctx;
}

/** Safe for toolbar/nav when provider may be absent outside FNO shell. */
export function useScoreAlertsOptional(): ScoreAlertsContextValue | null {
  return useContext(ScoreAlertsContext);
}
