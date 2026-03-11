import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { DEFAULT_PLANS, type Plan } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getAdminFirestore();
    const doc = await db.collection("config").doc("plans").get();

    if (doc.exists) {
      const data = doc.data();
      if (data?.plans && Array.isArray(data.plans) && data.plans.length > 0) {
        return NextResponse.json({ plans: data.plans as Plan[] });
      }
    }

    return NextResponse.json({ plans: DEFAULT_PLANS });
  } catch (error: any) {
    console.error("[Plans]", error.message);
    return NextResponse.json({ plans: DEFAULT_PLANS });
  }
}
