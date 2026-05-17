/**
 * POST /api/admin/bot-deployments/refresh-wallets
 *
 * Bulk wallet-balance refresh across every (optionally filtered) active
 * deployment. Bypasses the cron's throttle. Used as:
 *   - The "Refresh All" button on the admin bot-users list page.
 *   - A diagnostic when the cron's heartbeat appears stuck — the response
 *     payload reports per-deployment outcome (`valid` / `invalid` / `error`)
 *     so we can see exactly which deployment failed and why.
 *
 * Optional query params:
 *   ?bot=CRYPTO      — only refresh deployments for the given bot type
 *   ?exchange=BYBIT  — only refresh deployments on the given exchange
 *
 * Auth: `requireAdmin` (admin email allowlist). Concurrency capped at 5 to
 * stay clear of venue per-IP rate limits.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadCryptoCredentials } from "@/lib/freedombot/reconcile-exchange-pnl";
import { refreshDeploymentWalletBalance } from "@/lib/freedombot/wallet-balance";
import type { ExchangeName } from "@/lib/exchanges";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // venue API calls can take a few seconds each.

const CONCURRENCY = 5;

interface DeploymentOutcome {
  deploymentId: string;
  uid: string;
  exchange: string;
  email: string | null;
  status: "valid" | "invalid" | "no-credentials" | "error";
  total: number | null;
  available: number | null;
  currency: string | null;
  error: string | null;
  checkedAt: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const botFilter = searchParams.get("bot")?.trim().toUpperCase() || null;
  const exchangeFilter = searchParams.get("exchange")?.trim().toUpperCase() || null;

  try {
    const db = getAdminFirestore();
    let query: FirebaseFirestore.Query = db
      .collection("bot_deployments")
      .where("status", "==", "active");
    if (botFilter) query = query.where("bot", "==", botFilter);
    if (exchangeFilter) query = query.where("exchange", "==", exchangeFilter);

    const snap = await query.get();
    const deployments = snap.docs.map((d) => ({
      ref: d.ref,
      id: d.id,
      data: d.data(),
    }));

    if (deployments.length === 0) {
      return NextResponse.json({ refreshed: 0, outcomes: [], summary: { valid: 0, invalid: 0, "no-credentials": 0, error: 0 } });
    }

    const outcomes: DeploymentOutcome[] = new Array(deployments.length);
    let idx = 0;

    const runOne = async (i: number) => {
      const { ref, id, data } = deployments[i]!;
      const uid = String(data.uid ?? "");
      const exchange = String(data.exchange ?? "").toUpperCase() as ExchangeName;
      const email = (data.email as string) ?? null;

      const base: Omit<DeploymentOutcome, "status" | "total" | "available" | "currency" | "error" | "checkedAt"> = {
        deploymentId: id,
        uid,
        exchange,
        email,
      };

      if (!uid || !exchange) {
        outcomes[i] = {
          ...base,
          status: "error",
          total: null,
          available: null,
          currency: null,
          error: "Deployment doc is missing uid or exchange",
          checkedAt: null,
        };
        return;
      }

      try {
        const creds = await loadCryptoCredentials(db, uid, exchange);
        if (!creds) {
          const checkedAt = new Date().toISOString();
          await ref
            .update({
              walletStatus: "invalid",
              walletError: "No credentials found for this deployment.",
              walletCheckedAt: checkedAt,
            })
            .catch(() => {});
          outcomes[i] = {
            ...base,
            status: "no-credentials",
            total: null,
            available: null,
            currency: null,
            error: "No credentials found",
            checkedAt,
          };
          return;
        }

        const result = await refreshDeploymentWalletBalance(db, ref, exchange, creds);
        outcomes[i] = {
          ...base,
          status: result.status === "valid" ? "valid" : "invalid",
          total: result.total,
          available: result.available,
          currency: result.currency,
          error: result.error,
          checkedAt: result.checkedAt,
        };
      } catch (e) {
        outcomes[i] = {
          ...base,
          status: "error",
          total: null,
          available: null,
          currency: null,
          error: e instanceof Error ? e.message : String(e),
          checkedAt: null,
        };
      }
    };

    const worker = async () => {
      while (idx < deployments.length) {
        const myIdx = idx++;
        await runOne(myIdx);
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(CONCURRENCY, deployments.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const summary = { valid: 0, invalid: 0, "no-credentials": 0, error: 0 };
    for (const o of outcomes) summary[o.status]++;

    return NextResponse.json({
      refreshed: outcomes.length,
      summary,
      outcomes,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Refresh Wallets]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
