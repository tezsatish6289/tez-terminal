import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// ─── AES-256-CBC encryption ──────────────────────────────────────────────────

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptValue(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function encryptCredentials(
  credentials: Record<string, string>,
  encryptionKey: string,
): Record<string, string> {
  const key = deriveKey(encryptionKey);
  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(credentials)) {
    result[field] = encryptValue(value, key);
  }
  return result;
}

// ─── HMAC fingerprint (exchange + primary credential) ────────────────────────
// Deterministic and irreversible — safe to store in plaintext for uniqueness checks.
// We use the first credential field (apiKey / clientId) as the primary identifier.

function computeFingerprint(
  exchange: string,
  credentials: Record<string, string>,
  secret: string,
): string {
  const primaryKey = Object.values(credentials)[0] ?? "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${exchange}:${primaryKey}`)
    .digest("hex");
}

// ─── Validation ──────────────────────────────────────────────────────────────

const ALLOWED_BOTS = new Set(["CRYPTO", "INDIAN_STOCKS", "GOLD", "SILVER"]);
const ALLOWED_EXCHANGES: Record<string, Set<string>> = {
  CRYPTO:        new Set(["BINANCE", "BYBIT"]),
  INDIAN_STOCKS: new Set(["ZERODHA", "UPSTOX", "ANGEL_ONE", "DHAN"]),
};

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Parse body
    const body = await req.json();
    const { bot, exchange, credentials } = body as {
      bot?: string;
      exchange?: string;
      credentials?: Record<string, string>;
    };

    if (!bot || !exchange || !credentials || typeof credentials !== "object") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!ALLOWED_BOTS.has(bot)) {
      return NextResponse.json({ error: "Invalid bot" }, { status: 400 });
    }

    const allowedExchanges = ALLOWED_EXCHANGES[bot];
    if (!allowedExchanges?.has(exchange)) {
      return NextResponse.json({ error: "Invalid exchange for this bot" }, { status: 400 });
    }

    // Check ENCRYPTION_KEY
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Compute fingerprint for (exchange, primaryCredential) uniqueness check
    const keyFingerprint = computeFingerprint(exchange, credentials, encryptionKey);

    // Reject if this exact (exchange + API key) is already registered by anyone
    const db = getAdminFirestore();
    const duplicateSnap = await db
      .collection("bot_deployments")
      .where("exchange", "==", exchange)
      .where("keyFingerprint", "==", keyFingerprint)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      const existingUid = duplicateSnap.docs[0].data().uid;
      if (existingUid === uid) {
        return NextResponse.json(
          { error: "You have already connected this API key. Visit your dashboard to manage your bot." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "This API key is already registered on FreedomBot. Each exchange account can only be linked once." },
        { status: 409 },
      );
    }

    // Encrypt credentials
    const encryptedCreds = encryptCredentials(credentials, encryptionKey);

    // Save with fingerprint for future uniqueness enforcement
    const docRef = await db.collection("bot_deployments").add({
      uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      bot,
      exchange,
      credentials: encryptedCreds,
      keyFingerprint,
      status: "pending",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, deploymentId: docRef.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
