import type { Firestore } from "firebase-admin/firestore";
import { decrypt } from "@/lib/crypto";
import {
  docMatchesExchange,
  getSecretDocIds,
  type ExchangeName,
  type ExchangeCredentials,
} from "@/lib/exchanges";

export interface LoadedUserExchangeSecret {
  ref: FirebaseFirestore.DocumentReference;
  data: Record<string, unknown>;
  creds: ExchangeCredentials;
  keyLastFour: string | null;
}

/** Load decrypted credentials from `users/{uid}/secrets/{exchangeDoc}`. */
export async function loadUserExchangeSecret(
  db: Firestore,
  uid: string,
  exchange: ExchangeName,
): Promise<LoadedUserExchangeSecret | null> {
  const docIds = getSecretDocIds(exchange);
  for (const docId of docIds) {
    const ref = db.collection("users").doc(uid).collection("secrets").doc(docId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    if (!docMatchesExchange(data, exchange, docId)) continue;

    const encryptedKey = data.encryptedKey;
    const encryptedSecret = data.encryptedSecret;
    if (typeof encryptedKey !== "string" || typeof encryptedSecret !== "string") {
      continue;
    }

    return {
      ref,
      data,
      creds: {
        apiKey: decrypt(encryptedKey),
        apiSecret: decrypt(encryptedSecret),
        testnet: data.useTestnet === true,
      },
      keyLastFour:
        typeof data.keyLastFour === "string"
          ? data.keyLastFour
          : decrypt(encryptedKey).slice(-4),
    };
  }
  return null;
}
