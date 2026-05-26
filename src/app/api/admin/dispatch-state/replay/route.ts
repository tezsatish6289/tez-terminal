import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { executeForAllUsers } from "@/lib/live-execution";
import {
  getEffectiveSimConfig,
  SIM_CONFIG,
  type SimConfigType,
  type SimTrade,
} from "@/lib/simulator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ReplayBody = {
  simTradeId?: string;
  confirm?: boolean;
};

/**
 * POST /api/admin/dispatch-state/replay
 *
 * Re-invokes `executeForAllUsers` for an existing `simulator_trades`
 * doc, using the same `simTradeId` as the original dispatch. Purpose:
 * exercise the idempotency guard added in the dispatch_state PR.
 *
 * Expected behaviour on a replay:
 *   • Every (uid, exchange) task that ran on the first dispatch sees
 *     dispatch_state.create() throw ALREADY_EXISTS, logs
 *     DISPATCH_DUPLICATE_SKIP, and returns without touching the
 *     exchange.
 *   • No new live_trades docs are written for this simTradeId.
 *   • The existing dispatch_state docs' updatedAt timestamps remain
 *     unchanged (only DISPATCHING → EXECUTED|FAILED finalize updates
 *     them; a re-claim that hits ALREADY_EXISTS doesn't).
 *
 * Safety: protected by `requireAdmin`. The body must explicitly set
 * `confirm: true` to fire (otherwise returns a dry-run summary). Even
 * without the idempotency guard, the cap check inside the per-task
 * closure would skip any user whose (uid × exchange × bot) already
 * has its quota of OPEN live_trades — so a single replay is hard to
 * weaponise.
 *
 * Body: { simTradeId: string, confirm?: boolean }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ReplayBody;
  try {
    body = (await request.json()) as ReplayBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const simTradeId = body.simTradeId?.trim();
  if (!simTradeId) {
    return NextResponse.json(
      { error: "simTradeId is required" },
      { status: 400 },
    );
  }

  const db = getAdminFirestore();

  const tradeSnap = await db.collection("simulator_trades").doc(simTradeId).get();
  if (!tradeSnap.exists) {
    return NextResponse.json(
      { error: `simulator_trades/${simTradeId} not found` },
      { status: 404 },
    );
  }

  const trade = tradeSnap.data() as SimTrade & {
    botSource?: string;
    signal?: {
      id?: string;
      symbol?: string;
      type?: string;
      exchange?: string;
    };
    capitalAtEntry?: number;
  };

  const dispatchSnap = await db
    .collection("dispatch_state")
    .where("simTradeId", "==", simTradeId)
    .get();
  const existingTickets = dispatchSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      userId: String(x.userId ?? ""),
      exchange: String(x.exchange ?? ""),
      status: String(x.status ?? ""),
      updatedAt:
        (x.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? null,
    };
  });

  if (!body.confirm) {
    return NextResponse.json({
      dryRun: true,
      message:
        "No replay fired. Resend with { confirm: true } to invoke executeForAllUsers.",
      simTradeId,
      trade: {
        symbol: String(trade.signal?.symbol ?? trade.symbol ?? ""),
        side: String(trade.signal?.type ?? trade.side ?? ""),
        botSource: String(trade.botSource ?? "PATTERN"),
        exchange: String(trade.signal?.exchange ?? trade.exchange ?? ""),
      },
      existingTickets,
      ticketCount: existingTickets.length,
    });
  }

  let simConfig: SimConfigType = SIM_CONFIG;
  try {
    const paramsDoc = await db.doc("config/simulator_params").get();
    if (paramsDoc.exists) {
      simConfig = getEffectiveSimConfig(
        paramsDoc.data() as Partial<Record<keyof SimConfigType, number>>,
      );
    }
  } catch {
    /* fall back to default SIM_CONFIG */
  }

  const symbol = String(trade.signal?.symbol ?? trade.symbol ?? "");
  const signalType = String(trade.signal?.type ?? trade.side ?? "BUY");
  const signalExchange = String(trade.signal?.exchange ?? trade.exchange ?? "");
  const signalId = String(trade.signal?.id ?? simTradeId);
  const botSource = String(trade.botSource ?? "PATTERN");
  const simulatorCapital =
    typeof trade.capitalAtEntry === "number" && trade.capitalAtEntry > 0
      ? trade.capitalAtEntry
      : 1000;

  const startedAt = new Date().toISOString();

  try {
    await executeForAllUsers(
      db,
      trade,
      simTradeId,
      simulatorCapital,
      signalId,
      symbol,
      signalType,
      signalExchange,
      simConfig,
      botSource,
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: `executeForAllUsers threw: ${
          e instanceof Error ? e.message : String(e)
        }`,
        startedAt,
      },
      { status: 500 },
    );
  }

  const afterSnap = await db
    .collection("dispatch_state")
    .where("simTradeId", "==", simTradeId)
    .get();
  const afterTickets = afterSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      userId: String(x.userId ?? ""),
      exchange: String(x.exchange ?? ""),
      status: String(x.status ?? ""),
      updatedAt:
        (x.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? null,
    };
  });

  const ticketDiff = afterTickets
    .map((after) => {
      const before = existingTickets.find((b) => b.id === after.id);
      return {
        id: after.id,
        userId: after.userId,
        exchange: after.exchange,
        statusBefore: before?.status ?? "new",
        statusAfter: after.status,
        updatedAtChanged: before
          ? before.updatedAt !== after.updatedAt
          : true,
      };
    });

  const newTicketsCreated = afterTickets.length - existingTickets.length;

  return NextResponse.json({
    success: true,
    simTradeId,
    botSource,
    symbol,
    side: signalType,
    exchange: signalExchange,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: {
      ticketsBefore: existingTickets.length,
      ticketsAfter: afterTickets.length,
      newTicketsCreated,
      anyUpdatedAtChanged: ticketDiff.some((t) => t.updatedAtChanged),
    },
    ticketDiff,
    interpretation:
      newTicketsCreated === 0 && ticketDiff.every((t) => !t.updatedAtChanged)
        ? "IDEMPOTENT — replay produced no new tickets and no existing ticket was modified."
        : "ANOMALY — replay produced new or modified tickets. Investigate before trusting the guard.",
  });
}
