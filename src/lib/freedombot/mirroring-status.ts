/**
 * Server-side helpers to load mirroring fields from Firestore secrets.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getSecretDocIds, docMatchesExchange, type ExchangeName } from "@/lib/exchanges";
import { isDailyLossHaltedToday } from "@/lib/freedombot/daily-loss-gate";
import type { MirroringFields } from "@/lib/freedombot/mirroring-status-shared";

export type { MirroringFields, MirroringStatusView, MirroringDisplayStatus } from "@/lib/freedombot/mirroring-status-shared";
export {
  computeMirroringStatus,
  mirroringStatusTooltip,
  mirroringStatusColorClass,
} from "@/lib/freedombot/mirroring-status-shared";

export async function loadMirroringFieldsForExchange(
  db: Firestore,
  uid: string,
  exchange: string,
): Promise<MirroringFields> {
  const exchangeName = exchange.toUpperCase() as ExchangeName;
  for (const docId of getSecretDocIds(exchangeName)) {
    const secretDoc = await db.collection("users").doc(uid).collection("secrets").doc(docId).get();
    if (secretDoc.exists && docMatchesExchange(secretDoc.data()!, exchangeName, docId)) {
      const data = secretDoc.data()!;
      return {
        autoTradeEnabled:
          data.autoTradeEnabled === true ? true : data.autoTradeEnabled === false ? false : null,
        dailyLossHaltedToday: isDailyLossHaltedToday(data),
      };
    }
  }
  return { autoTradeEnabled: null, dailyLossHaltedToday: false };
}
