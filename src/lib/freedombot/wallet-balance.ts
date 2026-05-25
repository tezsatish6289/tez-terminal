/**
 * Shared helpers for fetching an exchange's wallet balance and persisting it
 * onto the corresponding `bot_deployments` document.
 *
 * Persisted fields (all optional — read sites must tolerate `undefined`):
 *   walletTotal:      number   – wallet currency total balance (e.g. USDT)
 *   walletAvailable:  number   – free / withdrawable portion of the wallet
 *   walletCurrency:   string   – "USDT" | "USDC" | "INR" (display only)
 *   walletStatus:     "valid" | "invalid"
 *                              – "valid" means the most recent `getUsdtBalance`
 *                                call succeeded; "invalid" means the venue
 *                                rejected the credentials or the connector
 *                                threw (network, key rotation, IP allowlist,
 *                                expired keys, etc.).
 *   walletError:      string|null – last error message when status="invalid".
 *                                   Cleared back to null on the next success.
 *   walletCheckedAt:  string   – ISO timestamp of the last refresh attempt
 *                                (regardless of outcome).
 *
 * The deployment row itself is the source of truth. We deliberately do NOT
 * write wallet info onto `users/{uid}/secrets/...` — secrets are encrypted
 * material; admin dashboards shouldn't read them just to fetch a number.
 *
 * Source of `getUsdtBalance` (despite the name) returns the venue-native
 * margin currency: USDT on Bybit/CoinDCX/Binance/MEXC, USDC on Hyperliquid.
 * See `src/lib/exchanges/<venue>.ts`.
 */

import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { appendWalletSnapshot } from "@/lib/freedombot/capital-ledger";
import {
  getConnector,
  type ExchangeCredentials,
  type ExchangeName,
} from "@/lib/exchanges";

/** Currency label shown next to the balance. Mirrors the value the venue
 *  reports inside `getUsdtBalance` (we don't translate it — just label it). */
export function walletCurrencyFor(exchange: string): string {
  const up = String(exchange ?? "").toUpperCase();
  if (up === "HYPERLIQUID") return "USDC";
  if (up === "DHAN") return "INR";
  // BYBIT, BINANCE, MEXC, COINDCX — all USDT-margined perps.
  return "USDT";
}

export type WalletStatus = "valid" | "invalid";

export interface DeploymentWalletFields {
  walletTotal: number | null;
  walletAvailable: number | null;
  walletCurrency: string;
  walletStatus: WalletStatus;
  walletError: string | null;
  walletCheckedAt: string;
}

/** Patch payload written to `bot_deployments/{id}` on every refresh. */
function buildWalletPatch(
  exchange: string,
  result:
    | { ok: true; total: number; available: number }
    | { ok: false; error: string },
): DeploymentWalletFields {
  const checkedAt = new Date().toISOString();
  const currency = walletCurrencyFor(exchange);
  if (result.ok) {
    return {
      walletTotal: Number.isFinite(result.total) ? result.total : 0,
      walletAvailable: Number.isFinite(result.available) ? result.available : 0,
      walletCurrency: currency,
      walletStatus: "valid",
      walletError: null,
      walletCheckedAt: checkedAt,
    };
  }
  return {
    // Keep the last-known total/available untouched on failure (we don't
    // know the current balance, so blanking the field would be misleading).
    // The cron + admin dashboard already merge with the existing doc; we
    // simply omit those keys when writing.
    walletTotal: null,
    walletAvailable: null,
    walletCurrency: currency,
    walletStatus: "invalid",
    walletError: result.error.slice(0, 400),
    walletCheckedAt: checkedAt,
  };
}

export interface RefreshWalletOptions {
  /** Skip the write if the cached balance was refreshed within this many
   *  milliseconds. Used by the cron to avoid pounding the venue on every
   *  tick — the admin manual-refresh button omits this. */
  skipIfCheckedWithinMs?: number;
  /** Existing wallet doc snapshot, used in conjunction with
   *  `skipIfCheckedWithinMs` to short-circuit without an extra Firestore
   *  read. */
  existingCheckedAt?: string | null;
}

export interface RefreshWalletResult {
  ok: boolean;
  skipped: boolean;
  status: WalletStatus | null;
  total: number | null;
  available: number | null;
  currency: string;
  error: string | null;
  checkedAt: string | null;
}

/**
 * Calls `connector.getUsdtBalance(creds)` and writes the outcome (plus a
 * status flag + error message on failure) to `deploymentRef`. Designed to
 * be best-effort — never throws. Callers can inspect the returned
 * `RefreshWalletResult` to know if the refresh actually happened.
 *
 * When called from the cron, pass `skipIfCheckedWithinMs` (e.g. 5 minutes)
 * along with `existingCheckedAt` from the deployment doc so we don't hit
 * the venue every minute just to confirm the same balance. Manual refresh
 * from the admin UI omits both and always refetches.
 */
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
        currency,
        error: null,
        checkedAt: opts.existingCheckedAt,
      };
    }
  }

  let patch: DeploymentWalletFields;
  try {
    const connector = getConnector(exchange);
    const balance = await connector.getUsdtBalance(creds);
    patch = buildWalletPatch(exchange, {
      ok: true,
      total: balance.total,
      available: balance.available,
    });
  } catch (e) {
    patch = buildWalletPatch(exchange, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // On failure we drop `walletTotal` / `walletAvailable` from the write so
  // the last-known values stay on the doc. `walletStatus = "invalid"` +
  // `walletError` tell the dashboard the number is stale.
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
    // If the deployment was deleted mid-flight we don't want to spam logs.
    console.warn(
      `[wallet-balance] Failed to persist wallet refresh for ${deploymentRef.path}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  if (patch.walletStatus === "valid" && patch.walletTotal != null) {
    try {
      const depSnap = await deploymentRef.get();
      const uid = depSnap.data()?.uid as string | undefined;
      const ex = String(depSnap.data()?.exchange ?? exchange).toUpperCase();
      if (uid) {
        await appendWalletSnapshot(db, uid, ex, patch.walletTotal, patch.walletCheckedAt, {
          deploymentId: deploymentRef.id,
          source: "wallet_refresh",
        });
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
    currency: patch.walletCurrency,
    error: patch.walletError,
    checkedAt: patch.walletCheckedAt,
  };
}

/** Convenience: persist a balance you already fetched (e.g. during the
 *  `deploy` flow we call `getUsdtBalance` to validate the keys — we don't
 *  want to call it again just to store the number). */
export async function persistWalletBalanceSnapshot(
  deploymentRef: DocumentReference,
  exchange: ExchangeName,
  result:
    | { ok: true; total: number; available: number }
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

  if (db && patch.walletStatus === "valid" && patch.walletTotal != null) {
    try {
      const depSnap = await deploymentRef.get();
      const uid = depSnap.data()?.uid as string | undefined;
      const ex = String(depSnap.data()?.exchange ?? exchange).toUpperCase();
      if (uid) {
        await appendWalletSnapshot(db, uid, ex, patch.walletTotal, patch.walletCheckedAt, {
          deploymentId: deploymentRef.id,
          source: "deploy",
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return patch;
}
