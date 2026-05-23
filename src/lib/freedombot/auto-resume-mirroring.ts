/**
 * Re-enable live mirroring for FreedomBot users whose `dailyLossHaltedUtcDate`
 * is now in the past (yesterday's daily-loss halt rolls over at UTC midnight).
 *
 * The legacy "kill-switch flipped autoTradeEnabled false" recovery path was
 * removed 2026-05-23 along with the legacy `/api/settings/kill-switch` route.
 * Kill switches are now strictly trade-level (close one sim + its live
 * mirrors via `/api/sim/force-close`) and never disable a user's bot, so
 * there's no orphaned `autoTradeEnabled: false` state left to recover from.
 * The only remaining writers of `autoTradeEnabled: false` are explicit user
 * actions (pause / stop deployment, fresh credential setup) — none of which
 * should be silently undone by a cron.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getSecretDocIds, docMatchesExchange, type ExchangeName } from "@/lib/exchanges";
import {
  clearDailyLossHaltPatch,
  isStaleDailyLossHalt,
  utcDateKey,
} from "@/lib/freedombot/daily-loss-gate";

export interface ResumeMirroringResult {
  resumed: boolean;
  reason?: string;
}

async function findSecretRef(
  db: Firestore,
  uid: string,
  exchange: ExchangeName,
) {
  for (const docId of getSecretDocIds(exchange)) {
    const ref = db.collection("users").doc(uid).collection("secrets").doc(docId);
    const snap = await ref.get();
    if (snap.exists && docMatchesExchange(snap.data()!, exchange, docId)) {
      return { ref, data: snap.data()! };
    }
  }
  return null;
}

/**
 * Turn auto-trade back on for an active deployment whose mirroring was disabled
 * (legacy kill switch or stale daily-loss halt). Idempotent if already on.
 */
export async function resumeLiveMirroringForDeployment(
  db: Firestore,
  uid: string,
  exchange: string,
  options?: { requireActiveDeployment?: boolean; force?: boolean },
): Promise<ResumeMirroringResult> {
  const exchangeName = exchange.toUpperCase() as ExchangeName;
  const requireActive = options?.requireActiveDeployment !== false;

  if (requireActive) {
    const deploySnap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .where("exchange", "==", exchangeName)
      .where("status", "==", "active")
      .limit(1)
      .get();
    if (deploySnap.empty) {
      return {
        resumed: false,
        reason: "No active deployment for this user and exchange",
      };
    }
  }

  const found = await findSecretRef(db, uid, exchangeName);
  if (!found) {
    return { resumed: false, reason: "Exchange credentials not found" };
  }

  const { ref, data } = found;
  const alreadyOn = data.autoTradeEnabled === true && !isStaleDailyLossHalt(data);
  const haltedToday =
    typeof data.dailyLossHaltedUtcDate === "string" &&
    data.dailyLossHaltedUtcDate === utcDateKey();

  if (options?.force) {
    await ref.update({
      autoTradeEnabled: true,
      ...clearDailyLossHaltPatch(),
    });
    if (alreadyOn && !haltedToday) {
      return { resumed: true, reason: "Mirroring was already on; credentials refreshed." };
    }
    if (haltedToday) {
      return {
        resumed: true,
        reason: "Daily loss pause cleared and mirroring re-enabled for today.",
      };
    }
    return { resumed: true };
  }

  if (alreadyOn && !haltedToday) {
    return { resumed: false, reason: "Live mirroring is already enabled" };
  }

  if (haltedToday) {
    return {
      resumed: false,
      reason:
        "Daily loss cap is active for today (UTC). Mirroring resumes automatically tomorrow, or wait until the next UTC day.",
    };
  }

  await ref.update({
    autoTradeEnabled: true,
    ...clearDailyLossHaltPatch(),
  });

  return { resumed: true };
}

/** Clear stale halt dates and re-enable auto-trade for active deployments (cron). */
export async function autoResumeStaleDailyLossHalts(db: Firestore): Promise<number> {
  const today = utcDateKey();
  const snap = await db.collectionGroup("secrets").get();
  let count = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const halted = data.dailyLossHaltedUtcDate;
    if (typeof halted !== "string" || halted >= today) continue;

    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;

    const exchange = String(data.exchange ?? "").toUpperCase();
    if (!exchange) continue;

    const deploySnap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .where("exchange", "==", exchange)
      .where("status", "==", "active")
      .limit(1)
      .get();

    // Only clear the stale halt date. Do NOT mutate `autoTradeEnabled` —
    // the daily-loss circuit-breaker never writes that flag, so if it's
    // currently `false` here it's because the user explicitly disabled
    // their bot (Settings → Pause / Stop deployment). A cron silently
    // flipping it back to `true` would override user intent, which is
    // exactly what the kill-switch audit (2026-05-23) forbade.
    await doc.ref.update({ ...clearDailyLossHaltPatch() });
    count++;
  }

  return count;
}
