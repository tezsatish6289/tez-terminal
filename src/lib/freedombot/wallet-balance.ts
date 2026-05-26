/**
 * Shared helpers for fetching an exchange's wallet balance and persisting it
 * onto the corresponding `bot_deployments` document.
 *
 * Persisted fields (all optional — read sites must tolerate `undefined`):
 *   walletTotal:      number   – futures wallet total (free + margin in use)
 *   walletAvailable:  number   – free margin available for new trades
 *   walletCurrency:   string   – "USDT" | "USDC" | "INR" (display only)
 *   walletStatus:     "valid" | "invalid"
 *   walletError:      string|null
 *   walletCheckedAt:  string   – ISO timestamp of the last refresh attempt
 *
 * All reads go through `fetchExchangeWalletBalance` in `@/lib/exchanges`.
 */

import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { appendWalletSnapshot } from "@/lib/freedombot/capital-ledger";
import {
  fetchExchangeWalletBalance,
  walletCurrencyFor,
  type ExchangeName,
  type ExchangeCredentials,
  type ExchangeWalletBalance,
} from "@/lib/exchanges";

export { walletCurrencyFor };

export type WalletStatus = "valid" | "invalid";

export interface DeploymentWalletFields {
  walletTotal: number | null;
  walletAvailable: number | null;
  walletCurrency: string;
  walletStatus: WalletStatus;
  walletError: string | null;
  walletCheckedAt: string;
}

function buildWalletPatch(
  exchange: string,
  result: { ok: true; balance: ExchangeWalletBalance } | { ok: false; error: string },
): DeploymentWalletFields {
  const checkedAt = new Date().toISOString();
  const currency = walletCurrencyFor(exchange);
  if (result.ok) {
    return {
      walletTotal: result.balance.total,
      walletAvailable: result.balance.available,
      walletCurrency: currency,
      walletStatus: "valid",
      walletError: null,
      walletCheckedAt: checkedAt,
    };
  }
  return {
    walletTotal: null,
    walletAvailable: null,
    walletCurrency: currency,
    walletStatus: "invalid",
    walletError: result.error.slice(0, 400),
    walletCheckedAt: checkedAt,
  };
}

function snapshotValues(
  balance: ExchangeWalletBalance,
): { total: number; available: number; lockedInUse: number } {
  return {
    total: balance.total,
    available: balance.available,
    lockedInUse: balance.lockedInUse,
  };
}

export interface RefreshWalletOptions {
  skipIfCheckedWithinMs?: number;
  existingCheckedAt?: string | null;
}

export interface RefreshWalletResult {
  ok: boolean;
  skipped: boolean;
  status: WalletStatus | null;
  total: number | null;
  available: number | null;
  lockedInUse: number | null;
  currency: string;
  error: string | null;
  checkedAt: string | null;
}

export async function refreshDeploymentWalletBalance(
  db: Firestore,
  deploymentRef: DocumentReference,
  exchange: ExchangeName,
  creds: ExchangeCredentials,
  opts?: RefreshWalletOptions,
): Promise<RefreshWalletResult> {
  const currency = walletCurrencyFor(exchange);

  if (
    opts?.skipIfCheckedWithinMs != null &&
    opts.existingCheckedAt &&
    typeof opts.existingCheckedAt === "string"
  ) {
    const lastMs = new Date(opts.existingCheckedAt).getTime();
    if (Number.isFinite(lastMs) && Date.now() - lastMs < opts.skipIfCheckedWithinMs) {
      return {
        ok: true,
        skipped: true,
        status: null,
        total: null,
        available: null,
        lockedInUse: null,
        currency,
        error: null,
        checkedAt: opts.existingCheckedAt,
      };
    }
  }

  let patch: DeploymentWalletFields;
  let balance: ExchangeWalletBalance | null = null;
  try {
    balance = await fetchExchangeWalletBalance(exchange, creds);
    patch = buildWalletPatch(exchange, { ok: true, balance });
  } catch (e) {
    patch = buildWalletPatch(exchange, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const writePayload: Record<string, unknown> = {
    walletCurrency: patch.walletCurrency,
    walletStatus: patch.walletStatus,
    walletError: patch.walletError,
    walletCheckedAt: patch.walletCheckedAt,
  };
  if (patch.walletStatus === "valid") {
    writePayload.walletTotal = patch.walletTotal;
    writePayload.walletAvailable = patch.walletAvailable;
  }

  try {
    await deploymentRef.update(writePayload);
  } catch (e) {
    console.warn(
      `[wallet-balance] Failed to persist wallet refresh for ${deploymentRef.path}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  if (patch.walletStatus === "valid" && balance) {
    try {
      const depSnap = await deploymentRef.get();
      const uid = depSnap.data()?.uid as string | undefined;
      const ex = String(depSnap.data()?.exchange ?? exchange).toUpperCase();
      if (uid) {
        await appendWalletSnapshot(
          db,
          uid,
          ex,
          snapshotValues(balance),
          patch.walletCheckedAt,
          {
            deploymentId: deploymentRef.id,
            source: "wallet_refresh",
          },
        );
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    ok: patch.walletStatus === "valid",
    skipped: false,
    status: patch.walletStatus,
    total: patch.walletTotal,
    available: patch.walletAvailable,
    lockedInUse: balance?.lockedInUse ?? null,
    currency: patch.walletCurrency,
    error: patch.walletError,
    checkedAt: patch.walletCheckedAt,
  };
}

/** Persist a balance already fetched via `fetchExchangeWalletBalance`. */
export async function persistWalletBalanceSnapshot(
  deploymentRef: DocumentReference,
  exchange: ExchangeName,
  result:
    | { ok: true; balance: ExchangeWalletBalance }
    | { ok: false; error: string },
  db?: Firestore,
): Promise<DeploymentWalletFields> {
  const patch = buildWalletPatch(exchange, result);
  const writePayload: Record<string, unknown> = {
    walletCurrency: patch.walletCurrency,
    walletStatus: patch.walletStatus,
    walletError: patch.walletError,
    walletCheckedAt: patch.walletCheckedAt,
  };
  if (patch.walletStatus === "valid") {
    writePayload.walletTotal = patch.walletTotal;
    writePayload.walletAvailable = patch.walletAvailable;
  }
  try {
    await deploymentRef.update(writePayload);
  } catch (e) {
    console.warn(
      `[wallet-balance] Failed to persist initial wallet snapshot for ${deploymentRef.path}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  if (db && result.ok && patch.walletStatus === "valid") {
    try {
      const depSnap = await deploymentRef.get();
      const uid = depSnap.data()?.uid as string | undefined;
      const ex = String(depSnap.data()?.exchange ?? exchange).toUpperCase();
      if (uid) {
        await appendWalletSnapshot(
          db,
          uid,
          ex,
          snapshotValues(result.balance),
          patch.walletCheckedAt,
          {
            deploymentId: deploymentRef.id,
            source: "deploy",
          },
        );
      }
    } catch {
      // Non-fatal
    }
  }

  return patch;
}
