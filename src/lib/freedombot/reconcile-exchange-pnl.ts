/**
 * Refresh exchange-reported realized PnL for closed live_trades (FreedomBot dashboard + admin).
 * Any crypto connector that implements getClosedPnl is supported (BYBIT, COINDCX; future BINANCE/MEXC).
 */
import type { Firestore } from "firebase-admin/firestore";
import { decrypt } from "@/lib/crypto";
import {
  getConnector,
  getSecretDocIds,
  docMatchesExchange,
  CRYPTO_BROKERS,
  isExchangeSupported,
  type ClosedPnlRecord,
  type BrokerName,
  type ExchangeCredentials,
  type ExchangeName,
} from "@/lib/exchanges";

/** Legacy rows without `exchange` field are treated as Bybit. */
export function tradeBelongsToVenue(
  docExchange: string | undefined | null,
  venue: ExchangeName,
): boolean {
  const ex = String(docExchange ?? "").toUpperCase();
  if (ex === venue) return true;
  if (!ex && venue === "BYBIT") return true;
  return false;
}

/** True when the connector exposes closed-PnL history for reconciliation. */
export function exchangeSupportsClosedPnlReconciliation(exchange: string): boolean {
  if (!isExchangeSupported(exchange)) return false;
  const upper = exchange.toUpperCase() as BrokerName;
  if (!CRYPTO_BROKERS.includes(upper)) return false;
  try {
    return typeof getConnector(exchange).getClosedPnl === "function";
  } catch {
    return false;
  }
}

/** CoinDCX sometimes returns unix seconds; Bybit uses ms. */
function recordTimeMs(r: ClosedPnlRecord): number {
  const t = r.createdTime;
  if (!t || Number.isNaN(t)) return 0;
  return t < 1e12 ? t * 1000 : t;
}

function sumPnlInWindow(
  records: ClosedPnlRecord[],
  openedAtMs: number,
  closedAtMs: number,
): number {
  const bufferAfterCloseMs = 3 * 60 * 60 * 1000; // funding/settlement lag
  const hi = closedAtMs + bufferAfterCloseMs;
  return records.reduce((sum, r) => {
    const ts = recordTimeMs(r);
    if (ts >= openedAtMs && ts <= hi) return sum + r.closedPnl;
    return sum;
  }, 0);
}

export async function loadCryptoCredentials(
  db: Firestore,
  uid: string,
  exchange: ExchangeName,
): Promise<(ExchangeCredentials & { testnet?: boolean }) | null> {
  const docIds = getSecretDocIds(exchange);
  for (const id of docIds) {
    try {
      const secretDoc = await db.collection("users").doc(uid).collection("secrets").doc(id).get();
      if (!secretDoc.exists) continue;
      const data = secretDoc.data()!;
      if (!docMatchesExchange(data, exchange)) continue;
      const apiKey = decrypt(data.encryptedKey);
      const apiSecret = decrypt(data.encryptedSecret);
      return {
        apiKey,
        apiSecret,
        testnet: data.useTestnet === true,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export interface ReconcileExchangePnlResult {
  reconciled: number;
  skippedNoApi: number;
  errors: string[];
  /** Sum of exchangeRealizedPnl for closed trades on this exchange after updates */
  totalClosedExchangePnl: number;
}

/**
 * For each closed production trade on `exchange`, fetch closed PnL rows from the venue
 * and sum those falling between openedAt and closedAt. Writes back exchangeRealizedPnl
 * plus reconciliation metadata.
 */
export async function reconcileUserExchangeClosedPnl(
  db: Firestore,
  uid: string,
  exchange: ExchangeName,
  creds: ExchangeCredentials,
): Promise<ReconcileExchangePnlResult> {
  const result: ReconcileExchangePnlResult = {
    reconciled: 0,
    skippedNoApi: 0,
    errors: [],
    totalClosedExchangePnl: 0,
  };

  if (!exchangeSupportsClosedPnlReconciliation(exchange)) {
    result.skippedNoApi = 1;
    return result;
  }

  const connector = getConnector(exchange);

  const snap = await db.collection("live_trades").where("userId", "==", uid).get();

  const closedOnVenue = snap.docs.filter((d) => {
    const t = d.data();
    if (t.testnet !== false) return false;
    if (t.status !== "CLOSED") return false;
    return tradeBelongsToVenue(t.exchange as string | undefined, exchange);
  });

  const nowIso = new Date().toISOString();

  for (const doc of closedOnVenue) {
    const lt = doc.data();
    const signalSymbol = String(lt.signalSymbol ?? lt.symbol ?? "");
    if (!signalSymbol) continue;

    const openedAtMs = new Date(String(lt.openedAt ?? 0)).getTime();
    const closedAtMs = lt.closedAt ? new Date(String(lt.closedAt)).getTime() : Date.now();
    if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) continue;

    const exchangeSymbol = connector.normalizeSymbol(signalSymbol);

    try {
      const startArg = Math.max(0, openedAtMs - 120_000);
      const records = await connector.getClosedPnl!(exchangeSymbol, creds, startArg);
      const exchangePnl = sumPnlInWindow(records, openedAtMs, closedAtMs);

      await doc.ref.update({
        exchangeRealizedPnl: Number(exchangePnl.toFixed(6)),
        exchangePnlReconciledAt: nowIso,
        exchangePnlSource: "exchange_closed_pnl_api",
      });
      result.reconciled++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${exchangeSymbol}: ${msg}`);
    }

    // Light throttle — some venues rate-limit burst GETs
    await new Promise((r) => setTimeout(r, 120));
  }

  // Re-sum totals for this exchange from Firestore (authoritative after writes)
  const snap2 = await db.collection("live_trades").where("userId", "==", uid).get();
  for (const d of snap2.docs) {
    const t = d.data();
    if (t.testnet !== false) continue;
    if (t.status !== "CLOSED") continue;
    if (!tradeBelongsToVenue(t.exchange as string | undefined, exchange)) continue;
    const pnl = t.exchangeRealizedPnl;
    if (typeof pnl === "number" && !Number.isNaN(pnl)) {
      result.totalClosedExchangePnl += pnl;
    }
  }

  result.totalClosedExchangePnl = Number(result.totalClosedExchangePnl.toFixed(4));
  return result;
}
