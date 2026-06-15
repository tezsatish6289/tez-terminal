import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  loadDhanFnoReport,
  patchDhanFnoInstrument,
  syncDhanFnoInstruments,
  validateDhanFnoOptionChains,
} from "@/lib/dhan-instruments-sync";
import {
  runFnoUniversePipeline,
  summarizeFnoUniversePipeline,
} from "@/lib/fno-universe-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET  — F&O mapping report (all 193 symbols + status)
 * POST — { action: "sync" } | { action: "validate", symbols?, limit? } | { action: "pipeline" }
 * PATCH — { symbol, securityId, dhanSymbol? } manual correction
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const report = await loadDhanFnoReport(getAdminFirestore());
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getAdminFirestore();
  let body: { action?: string; symbols?: string[]; limit?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = { action: "sync" };
  }

  try {
    if (body.action === "pipeline") {
      const result = await runFnoUniversePipeline(db, { validateLimit: body.limit ?? 20 });
      return NextResponse.json({
        success: true,
        summary: summarizeFnoUniversePipeline(result),
        ...result,
      });
    }
    if (body.action === "validate") {
      const result = await validateDhanFnoOptionChains(db, {
        symbols: body.symbols,
        limit: body.limit,
      });
      return NextResponse.json({ success: true, ...result });
    }

    const result = await syncDhanFnoInstruments(db);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin dhan-fno-instruments]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      symbol?: string;
      securityId?: number;
      dhanSymbol?: string;
    };
    if (!body.symbol?.trim()) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }
    if (body.securityId == null || !Number.isFinite(body.securityId)) {
      return NextResponse.json({ error: "securityId required" }, { status: 400 });
    }

    const entry = await patchDhanFnoInstrument(getAdminFirestore(), {
      symbol: body.symbol,
      securityId: body.securityId,
      dhanSymbol: body.dhanSymbol,
    });
    return NextResponse.json({ success: true, symbol: body.symbol.toUpperCase(), entry });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
