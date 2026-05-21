import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  previewRetireSignals,
  retireUnusedSignals,
  type SignalSide,
} from "@/lib/signal-retire";

export const dynamic = "force-dynamic";

const ASSET_TYPES = ["CRYPTO", "INDIAN_STOCKS"] as const;

function parseSide(raw: string | null): SignalSide | null {
  if (raw === "bull" || raw === "BUY") return "BUY";
  if (raw === "bear" || raw === "SELL") return "SELL";
  return null;
}

/** GET ?side=bull|bear&assetType=CRYPTO — preview counts before retiring. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const side = parseSide(searchParams.get("side"));
  if (!side) {
    return NextResponse.json({ error: "Missing or invalid side (bull|bear)" }, { status: 400 });
  }

  const assetType = searchParams.get("assetType");
  const db = getAdminFirestore();
  const preview = await previewRetireSignals(
    db,
    side,
    assetType && ASSET_TYPES.includes(assetType as (typeof ASSET_TYPES)[number])
      ? assetType
      : undefined,
  );

  return NextResponse.json(preview);
}

/** POST { side: "bull"|"bear", assetType?: "CRYPTO"|"INDIAN_STOCKS" } — retire unused ACTIVE signals. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const side = parseSide(body.side ?? null);
  if (!side) {
    return NextResponse.json({ error: "Missing or invalid side (bull|bear)" }, { status: 400 });
  }

  const assetType =
    typeof body.assetType === "string" &&
    ASSET_TYPES.includes(body.assetType as (typeof ASSET_TYPES)[number])
      ? body.assetType
      : undefined;

  const db = getAdminFirestore();
  const result = await retireUnusedSignals(db, side, {
    assetType,
    retiredBy: auth.decoded.email ?? auth.decoded.uid,
  });

  const [bullPreview, bearPreview] = await Promise.all([
    previewRetireSignals(db, "BUY", assetType),
    previewRetireSignals(db, "SELL", assetType),
  ]);

  return NextResponse.json({
    success: true,
    side,
    assetType: assetType ?? null,
    ...result,
    remaining: {
      bull: bullPreview,
      bear: bearPreview,
    },
  });
}
