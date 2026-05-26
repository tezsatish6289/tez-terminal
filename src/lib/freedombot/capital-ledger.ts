/**
 * Append-only wallet snapshots per user + exchange for the FreedomBot
 * capital curve (shared futures wallet on the venue).
 */

import type { Firestore } from "firebase-admin/firestore";

export type CapitalLedgerSource = "wallet_refresh" | "deploy" | "cron";

export interface CapitalLedgerSnapshot {
  kind: "snapshot";
  /** Total wallet (free + margin in use). Kept as `amount` for older readers. */
  amount: number;
  total: number;
  available: number;
  lockedInUse: number;
  at: string;
  source: CapitalLedgerSource;
  deploymentId?: string;
}

export interface WalletSnapshotValues {
  total: number;
  available: number;
  lockedInUse: number;
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

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Best-effort — never throws. */
export async function appendWalletSnapshot(
  db: Firestore,
  userId: string,
  exchange: string,
  values: WalletSnapshotValues,
  at: string,
  meta?: { deploymentId?: string; source?: CapitalLedgerSource },
): Promise<void> {
  const total = roundUsd(values.total);
  if (!userId || !exchange || !Number.isFinite(total)) return;
  const available = roundUsd(values.available);
  const lockedInUse = roundUsd(values.lockedInUse);
  const payload: CapitalLedgerSnapshot = {
    kind: "snapshot",
    amount: total,
    total,
    available,
    lockedInUse,
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
): Promise<{ at: string; amount: number; available?: number; lockedInUse?: number }[]> {
  const snap = await ledgerEventsRef(db, userId, exchange)
    .where("kind", "==", "snapshot")
    .orderBy("at", "asc")
    .limit(limit)
    .get();

  const rows: { at: string; amount: number; available?: number; lockedInUse?: number }[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const at = typeof d.at === "string" ? d.at : null;
    const total =
      typeof d.total === "number"
        ? d.total
        : typeof d.amount === "number"
          ? d.amount
          : null;
    if (!at || total == null || !Number.isFinite(total)) continue;
    rows.push({
      at,
      amount: total,
      ...(typeof d.available === "number" ? { available: d.available } : {}),
      ...(typeof d.lockedInUse === "number" ? { lockedInUse: d.lockedInUse } : {}),
    });
  }
  return rows;
}
