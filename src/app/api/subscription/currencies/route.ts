import { NextResponse } from "next/server";
import { getAvailableCurrencies } from "@/lib/nowpayments";

export const revalidate = 3600;

export async function GET() {
  try {
    const currencies = await getAvailableCurrencies();
    return NextResponse.json({ currencies });
  } catch (error: any) {
    console.error("[Currencies]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
