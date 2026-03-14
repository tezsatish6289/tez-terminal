import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const db = getAdminFirestore();
    const today = new Date().toISOString().slice(0, 10);
    await db.collection("config").doc("site_visits").set(
      { total: FieldValue.increment(1), [`daily.${today}`]: FieldValue.increment(1) },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
