/**
 * Append-only wallet snapshots per user + exchange for the FreedomBot
 * capital curve (shared futures wallet on the venue).
 */

import type { Firestore } from "firebase-admin/firestore";

export type CapitalLedgerSource = "wallet_refresh" | "deploy" | "cron";

export interface CapitalLedgerSnapshot {
  kind: "snapshot";
  amount: number;
  at: string;
  source: CapitalLedgerSource;
  deploymentId?: string;
}

function ledgerEventsRef(db: Firestore, userId: string, exchange: string) {
  const ex = String(exchange).toUpperCase();
  return db
    .collection("users")
    .doc(userId)
    .collection("capital_ledger")
    .doc(ex)
    .collection("events");
}

/** Best-effort — never throws. */
export async function appendWalletSnapshot(
  db: Firestore,
  userId: string,
  exchange: string,
  amount: number,
  at: string,
  meta?: { deploymentId?: string; source?: CapitalLedgerSource },
): Promise<void> {
  if (!userId || !exchange || !Number.isFinite(amount)) return;
  const payload: CapitalLedgerSnapshot = {
    kind: "snapshot",
    amount: Math.round(amount * 100) / 100,
    at,
    source: meta?.source ?? "wallet_refresh",
    ...(meta?.deploymentId ? { deploymentId: meta.deploymentId } : {}),
  };
  try {
    await ledgerEventsRef(db, userId, exchange).add(payload);
  } catch (e) {
    console.warn(
      `[capital-ledger] append failed for ${userId}/${exchange}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

export async function listWalletSnapshots(
  db: Firestore,
  userId: string,
  exchange: string,
  limit = 500,
): Promise<{ at: string; amount: number }[]> {
  const snap = await ledgerEventsRef(db, userId, exchange)
    .where("kind", "==", "snapshot")
    .orderBy("at", "asc")
    .limit(limit)
    .get();

  const rows: { at: string; amount: number }[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const at = typeof d.at === "string" ? d.at : null;
    const amount = typeof d.amount === "number" ? d.amount : null;
    if (!at || amount == null || !Number.isFinite(amount)) continue;
    rows.push({ at, amount });
  }
  return rows;
}
