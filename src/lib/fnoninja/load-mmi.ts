import "server-only";

import { mmiZoneForValue, type MmiSnapshot } from "@/lib/fnoninja/mmi";

const TICKERTAPE_MMI_URL = "https://api.tickertape.in/mmi/now";

type TickertapeMmiPayload = {
  success?: boolean;
  data?: {
    indicator?: number;
    currentValue?: number;
    date?: string;
  };
};

/** Fetch Tickertape Market Mood Index (0–100). Returns null on upstream failure. */
export async function loadMmi(): Promise<MmiSnapshot | null> {
  try {
    const res = await fetch(TICKERTAPE_MMI_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "FNONINJA/1.0 (+https://fnoninja.com)",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as TickertapeMmiPayload;
    const raw = json.data?.currentValue ?? json.data?.indicator;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    const value = Math.max(0, Math.min(100, raw));
    return {
      value,
      updatedAt: json.data?.date ?? new Date().toISOString(),
      zone: mmiZoneForValue(value),
    };
  } catch {
    return null;
  }
}
