"use client";

import { useEffect, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";

const NIFTY = "NIFTY";

/** Shared live NIFTY levels + 15m candles for Learn article previews. */
export function useLearnNiftyLiveData() {
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [candles, setCandles] = useState<CandlestickData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [candlesLoading, setCandlesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/freedombot/levels", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { indices?: { symbol?: string; data: PublicLevels | null }[] }) => {
        if (cancelled) return;
        const hit = json.indices?.find((it) => (it.symbol ?? "").toUpperCase() === NIFTY);
        setLevels(hit?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setLevels(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCandlesLoading(true);
    void fetch("/api/freedombot/levels/candles?symbol=NIFTY&scope=index&interval=15", {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { ok: boolean; candles?: { time: number; open: number; high: number; low: number; close: number }[] }) => {
        if (cancelled) return;
        if (!json.ok || !json.candles?.length) {
          setCandles(null);
          return;
        }
        setCandles(
          json.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setCandles(null);
      })
      .finally(() => {
        if (!cancelled) setCandlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { levels, candles, loading, candlesLoading };
}
