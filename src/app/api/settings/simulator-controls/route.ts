import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const DOC_PATH = "config/simulator_params";

export type DirectionBias = "BULL" | "BEAR" | "BOTH";
export type AssetType = "CRYPTO" | "INDIAN_STOCKS";

const ASSET_TYPES: AssetType[] = ["CRYPTO", "INDIAN_STOCKS"];

interface SimControls {
  simEnabled: boolean;
  directionBias: DirectionBias;
}

const DEFAULTS: SimControls = {
  simEnabled: true,
  directionBias: "BOTH",
};

function getAssetKey(field: string, assetType: AssetType) {
  return `${field}_${assetType}`;
}

function resolveControls(data: Record<string, unknown>, assetType: AssetType): SimControls {
  const enabledKey = getAssetKey("simEnabled", assetType);
  const biasKey = getAssetKey("directionBias", assetType);

  // Per-asset value → fall back to global → fall back to default
  const simEnabled =
    typeof data[enabledKey] === "boolean"
      ? (data[enabledKey] as boolean)
      : typeof data.simEnabled === "boolean"
        ? (data.simEnabled as boolean)
        : DEFAULTS.simEnabled;

  const directionBias = (["BULL", "BEAR", "BOTH"].includes(data[biasKey] as string)
    ? (data[biasKey] as DirectionBias)
    : ["BULL", "BEAR", "BOTH"].includes(data.directionBias as string)
      ? (data.directionBias as DirectionBias)
      : DEFAULTS.directionBias);

  return { simEnabled, directionBias };
}

/** GET /api/settings/simulator-controls?assetType=CRYPTO */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assetType = searchParams.get("assetType") as AssetType | null;

  const db = getAdminFirestore();
  const snap = await db.doc(DOC_PATH).get();
  const data: Record<string, unknown> = snap.exists ? snap.data() ?? {} : {};

  if (assetType && ASSET_TYPES.includes(assetType)) {
    // Return controls specific to the requested asset type
    return NextResponse.json(resolveControls(data, assetType));
  }

  // No assetType param → return controls for all asset types (used by sync-simulator)
  const result: Record<string, SimControls> = {};
  for (const at of ASSET_TYPES) {
    result[at] = resolveControls(data, at);
  }
  return NextResponse.json(result);
}

/** PUT /api/settings/simulator-controls?assetType=CRYPTO */
export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const assetType = searchParams.get("assetType") as AssetType | null;

  const body = await request.json();
  const db = getAdminFirestore();
  const update: Record<string, unknown> = {};

  if (assetType && ASSET_TYPES.includes(assetType)) {
    // Save per-asset-type keys
    if (typeof body.simEnabled === "boolean") {
      update[getAssetKey("simEnabled", assetType)] = body.simEnabled;
    }
    if (["BULL", "BEAR", "BOTH"].includes(body.directionBias)) {
      update[getAssetKey("directionBias", assetType)] = body.directionBias;
    }
  } else {
    // Legacy: save global keys (still works for any existing callers without assetType)
    if (typeof body.simEnabled === "boolean") {
      update.simEnabled = body.simEnabled;
    }
    if (["BULL", "BEAR", "BOTH"].includes(body.directionBias)) {
      update.directionBias = body.directionBias;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: "No valid fields" }, { status: 400 });
  }

  await db.doc(DOC_PATH).set(update, { merge: true });
  return NextResponse.json({ success: true, saved: update });
}
