/**
 * Dhan health check — one call to verify the whole chart pipeline.
 *
 * GET ?key=<CRON_SECRET>
 *   1. ensureValidToken() → exercises TOTP auto-renewal
 *   2. Dhan User Profile  → token validity + Data API subscription (dataPlan)
 *   3. Sample intraday candle fetch (RELIANCE) → end-to-end check
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureValidToken } from "@/lib/dhan-token";
import { getStockCandles } from "@/lib/dhan-candles";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DHAN_BASE_URL = "https://api.dhan.co/v2";

function jwtExpiry(token: string): { expiresAt: string | null; expired: boolean } {
  try {
    const part = token.split(".")[1];
    if (!part) return { expiresAt: null, expired: false };
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const exp = typeof payload.exp === "number" ? payload.exp * 1000 : null;
    return {
      expiresAt: exp ? new Date(exp).toISOString() : null,
      expired: exp != null && Date.now() >= exp,
    };
  } catch {
    return { expiresAt: null, expired: false };
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const out: Record<string, unknown> = { checkedAt: new Date().toISOString() };

  // 1. Token (this also runs RenewToken / TOTP if needed)
  const creds = await ensureValidToken();
  if (!creds) {
    return NextResponse.json(
      {
        ...out,
        token: { ok: false },
        hint:
          "No valid token. Confirm DHAN_TOTP_SECRET + DHAN_PIN secrets exist and TOTP is enabled on Dhan, or seed a token via /api/admin/dhan-token.",
      },
      { status: 200 },
    );
  }
  out.token = { ok: true, ...jwtExpiry(creds.apiKey) };

  // 2. User profile — token validity + Data API plan
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${DHAN_BASE_URL}/profile`, {
      headers: { "access-token": creds.apiKey, "client-id": creds.apiSecret },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    out.profile = res.ok
      ? {
          ok: true,
          tokenValidity: body.tokenValidity ?? null,
          activeSegment: body.activeSegment ?? null,
          dataPlan: body.dataPlan ?? null,
          dataValidity: body.dataValidity ?? null,
        }
      : { ok: false, status: res.status, error: body };
  } catch (e) {
    out.profile = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // 3. Sample candle fetch
  try {
    const sample = await getStockCandles("RELIANCE", "5");
    out.candles = {
      ok: sample.ok,
      count: sample.candles.length,
      stale: sample.stale ?? false,
      error: sample.error ?? null,
      latest: sample.candles.at(-1) ?? null,
    };
  } catch (e) {
    out.candles = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
