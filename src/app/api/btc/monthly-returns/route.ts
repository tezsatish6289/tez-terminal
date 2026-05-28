import { NextRequest, NextResponse } from "next/server";
import { fetchBtcMonthlyReturnSeries } from "@/lib/btc-monthly-returns";

export const dynamic = "force-dynamic";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

type CacheEntry = { data: Awaited<ReturnType<typeof fetchBtcMonthlyReturnSeries>>; ts: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function monthKeysFromRange(from: string, to: string): string[] {
  const keys: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? from;

  if (!MONTH_KEY_RE.test(from) || !MONTH_KEY_RE.test(to)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must be <= to" }, { status: 400 });
  }

  const cacheKey = `${from}:${to}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json({ points: hit.data, source: "cache" });
  }

  try {
    const monthKeys = monthKeysFromRange(from, to);
    const points = await fetchBtcMonthlyReturnSeries(monthKeys);
    cache.set(cacheKey, { data: points, ts: Date.now() });
    return NextResponse.json({ points, source: "live" });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch BTC klines";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
