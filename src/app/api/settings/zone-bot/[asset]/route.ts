import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  coerceZoneBotSettingField,
  parseZoneBotSettings,
  zoneBotSettingsDoc,
  type ZoneBotAsset,
  type ZoneBotSettings,
} from "@/lib/zone-bot-config";

export const dynamic = "force-dynamic";

const VALID_ASSETS: ZoneBotAsset[] = ["btc", "eth", "sol"];

function parseAsset(raw: string): ZoneBotAsset | null {
  if (VALID_ASSETS.includes(raw as ZoneBotAsset)) return raw as ZoneBotAsset;
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset: raw } = await params;
  const asset = parseAsset(raw);
  if (!asset) {
    return NextResponse.json({ error: "Invalid asset" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const snap = await db.doc(zoneBotSettingsDoc(asset)).get();
  const settings = parseZoneBotSettings(asset, snap.exists ? (snap.data() ?? {}) : {});
  return NextResponse.json(settings);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset: raw } = await params;
  const asset = parseAsset(raw);
  if (!asset) {
    return NextResponse.json({ error: "Invalid asset" }, { status: 400 });
  }

  const body = (await request.json()) as Partial<ZoneBotSettings>;
  const db = getAdminFirestore();
  const docPath = zoneBotSettingsDoc(asset);
  const snap = await db.doc(docPath).get();
  const current = parseZoneBotSettings(asset, snap.exists ? (snap.data() ?? {}) : {});

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of Object.keys(current) as (keyof ZoneBotSettings)[]) {
    if (!(key in body)) continue;
    const coerced = coerceZoneBotSettingField(key, body[key]);
    if (coerced !== null) update[key] = coerced;
  }

  await db.doc(docPath).set(update, { merge: true });
  const merged = parseZoneBotSettings(asset, { ...current, ...update });
  return NextResponse.json({ success: true, settings: merged });
}
