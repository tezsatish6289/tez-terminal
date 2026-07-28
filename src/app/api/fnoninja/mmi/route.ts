import { NextResponse } from "next/server";
import { mmiZoneForValue, type MmiSnapshot } from "@/lib/fnoninja/mmi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TICKERTAPE_MMI_URL = "https://api.tickertape.in/mmi/now";

type TickertapeMmiPayload = {
  success?: boolean;
  data?: {
    indicator?: number;
    currentValue?: number;
    date?: string;
  };
};

export async function GET() {
  try {
    const res = await fetch(TICKERTAPE_MMI_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "FNONINJA/1.0 (+https://fnoninja.com)",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "mmi_upstream_failed" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    const json = (await res.json()) as TickertapeMmiPayload;
    const raw = json.data?.currentValue ?? json.data?.indicator;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return NextResponse.json(
        { error: "mmi_invalid_payload" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    const value = Math.max(0, Math.min(100, raw));
    const snapshot: MmiSnapshot = {
      value,
      updatedAt: json.data?.date ?? new Date().toISOString(),
      zone: mmiZoneForValue(value),
    };
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" },
    });
  } catch {
    return NextResponse.json(
      { error: "mmi_fetch_failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
