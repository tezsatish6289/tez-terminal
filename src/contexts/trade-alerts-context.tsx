"use client";

import { createContext, useContext, useCallback, useState, type ReactNode } from "react";

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
  enable: () => void;
  disable: () => void;
  addAlert: (alert: TradeAlert) => void;
  clearHistory: () => void;
}

const TradeAlertsContext = createContext<TradeAlertsState | null>(null);

export function TradeAlertsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("tez_alerts_enabled") === "true";
    return false;
  });
  const [history, setHistory] = useState<TradeAlert[]>([]);

  const enable = useCallback(() => {
    setEnabled(true);
    localStorage.setItem("tez_alerts_enabled", "true");

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    localStorage.setItem("tez_alerts_enabled", "false");
  }, []);

  const addAlert = useCallback((alert: TradeAlert) => {
    setHistory((prev) => [alert, ...prev].slice(0, 50));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return (
    <TradeAlertsContext.Provider
      value={{ enabled, history, enable, disable, addAlert, clearHistory }}
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
