import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import {
  encodeFavslideStorage,
  FNONINJA_FAVSLIDE_FIELD,
  favslideEntryKey,
  MAX_FAVSLIDE_SYMBOLS,
  normalizeFavslideSymbol,
  parseFavslideEntries,
  type FavslideEntry,
} from "@/lib/fnoninja/favslide";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export const dynamic = "force-dynamic";

async function requireUid(request: NextRequest): Promise<string | NextResponse> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace("Bearer ", "").trim();
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

function parseBodyEntry(body: {
  symbol?: string;
  scope?: string;
}): FavslideEntry | null {
  const symbol = normalizeFavslideSymbol(body.symbol ?? "");
  if (!symbol) return null;
  const scope: LevelsTvScope = body.scope === "index" ? "index" : "stock";
  return { scope, symbol };
}

export async function GET(request: NextRequest) {
  const uid = await requireUid(request);
  if (uid instanceof NextResponse) return uid;

  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  const entries = parseFavslideEntries(snap.data()?.[FNONINJA_FAVSLIDE_FIELD]);
  return NextResponse.json({
    symbols: encodeFavslideStorage(entries),
    entries,
  });
}

export async function POST(request: NextRequest) {
  const uid = await requireUid(request);
  if (uid instanceof NextResponse) return uid;

  const body = (await request.json()) as {
    symbol?: string;
    scope?: string;
    action?: string;
  };
  const entry = parseBodyEntry(body);
  if (!entry) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const action = body.action === "remove" ? "remove" : "add";
  const key = favslideEntryKey(entry);
  const db = getAdminFirestore();
  const ref = db.collection("users").doc(uid);

  try {
    const entries = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = parseFavslideEntries(snap.data()?.[FNONINJA_FAVSLIDE_FIELD]);
      let next: FavslideEntry[];

      if (action === "remove") {
        next = current.filter((e) => favslideEntryKey(e) !== key);
      } else if (current.some((e) => favslideEntryKey(e) === key)) {
        next = current;
      } else {
        if (current.length >= MAX_FAVSLIDE_SYMBOLS) {
          throw new Error(`Favslide limit is ${MAX_FAVSLIDE_SYMBOLS} symbols`);
        }
        next = [...current, entry];
      }

      tx.set(ref, { [FNONINJA_FAVSLIDE_FIELD]: encodeFavslideStorage(next) }, { merge: true });
      return next;
    });

    return NextResponse.json({
      symbols: encodeFavslideStorage(entries),
      entries,
      entry,
      favorited: entries.some((e) => favslideEntryKey(e) === key),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    const status = msg.includes("limit") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
