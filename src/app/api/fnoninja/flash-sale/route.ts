import { NextResponse } from "next/server";
import {
  ensureFlashSaleCoupons,
  getFlashSalePublicState,
} from "@/lib/fnoninja/flash-sale-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/fnoninja/flash-sale
 * Public flash-sale state for the levels promo bubble + subscribe UI.
 * Never includes secrets; coupon code is only present while a window is live.
 */
export async function GET() {
  try {
    // Best-effort: keep Zoho coupons in sync for the ladder steps.
    void ensureFlashSaleCoupons().catch((e) =>
      console.warn("[FlashSale] ensure coupons:", (e as Error).message),
    );

    const state = await getFlashSalePublicState();
    return NextResponse.json(state, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (e) {
    console.error("[FlashSale] GET failed:", (e as Error).message);
    return NextResponse.json(
      { error: "flash_sale_unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
