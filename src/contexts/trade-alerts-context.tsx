"use client";

import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { toast } from "@/hooks/use-toast";

export interface TradeAlert {
  id: string;
  symbol: string;
  direction: "Bullish" | "Bearish";
  timeframeName: string;
  sentimentLabel: string;
  timestamp: number;
}

interface TradeAlertsState {
  enabled: boolean;
  history: TradeAlert[];
  requestPermission: () => Promise<boolean>;
  disable: () => void;
  addAlert: (alert: TradeAlert) => void;
  clearHistory: () => void;
}

const TradeAlertsContext = createContext<TradeAlertsState | null>(null);

export function TradeAlertsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission === "granted";
    }
    return false;
  });

  const [history, setHistory] = useState<TradeAlert[]>([]);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;

    if (Notification.permission === "granted") {
      setEnabled(true);
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
    return ok;
  }, []);

  const disable = useCallback(() => setEnabled(false), []);

  const addAlert = useCallback((alert: TradeAlert) => {
    setHistory((prev) => [alert, ...prev].slice(0, 50));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return (
    <TradeAlertsContext.Provider
      value={{ enabled, history, requestPermission, disable, addAlert, clearHistory }}
    >
      {children}
    </TradeAlertsContext.Provider>
  );
}

export function useTradeAlertsContext() {
  const ctx = useContext(TradeAlertsContext);
  if (!ctx) throw new Error("useTradeAlertsContext must be used within TradeAlertsProvider");
  return ctx;
}
