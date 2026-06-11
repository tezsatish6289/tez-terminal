import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import {
  FNONINJA_FAVSLIDE_FIELD,
  MAX_FAVSLIDE_SYMBOLS,
  normalizeFavslideSymbol,
  parseFavslideSymbols,
} from "@/lib/fnoninja/favslide";

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

export async function GET(request: NextRequest) {
  const uid = await requireUid(request);
  if (uid instanceof NextResponse) return uid;

  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  const symbols = parseFavslideSymbols(snap.data()?.[FNONINJA_FAVSLIDE_FIELD]);
  return NextResponse.json({ symbols });
}

export async function POST(request: NextRequest) {
  const uid = await requireUid(request);
  if (uid instanceof NextResponse) return uid;

  const body = (await request.json()) as { symbol?: string; action?: string };
  const symbol = normalizeFavslideSymbol(body.symbol ?? "");
  if (!symbol) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const action = body.action === "remove" ? "remove" : "add";
  const db = getAdminFirestore();
  const ref = db.collection("users").doc(uid);

  try {
    const symbols = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = parseFavslideSymbols(snap.data()?.[FNONINJA_FAVSLIDE_FIELD]);
      let next: string[];

      if (action === "remove") {
        next = current.filter((s) => s !== symbol);
      } else if (current.includes(symbol)) {
        next = current;
      } else {
        if (current.length >= MAX_FAVSLIDE_SYMBOLS) {
          throw new Error(`Favslide limit is ${MAX_FAVSLIDE_SYMBOLS} symbols`);
        }
        next = [...current, symbol];
      }

      tx.set(ref, { [FNONINJA_FAVSLIDE_FIELD]: next }, { merge: true });
      return next;
    });

    return NextResponse.json({ symbols, symbol, favorited: symbols.includes(symbol) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    const status = msg.includes("limit") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
