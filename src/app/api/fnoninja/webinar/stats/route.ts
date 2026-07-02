import { NextResponse } from "next/server";
import { getWebinarRegistrationTotal } from "@/lib/fnoninja/webinar-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const total = await getWebinarRegistrationTotal();
  return NextResponse.json(
    { total },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
