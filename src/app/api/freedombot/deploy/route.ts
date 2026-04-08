import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// ─── AES-256-CBC encryption ──────────────────────────────────────────────────

function deriveKey(secret: string): Buffer {
  // Derive a stable 32-byte key from whatever string ENCRYPTION_KEY holds
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

    // Encrypt credentials
    const encryptedCreds = encryptCredentials(credentials, encryptionKey);

    // Save to Firestore
    const db = getAdminFirestore();
    const docRef = await db.collection("bot_deployments").add({
      uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      bot,
      exchange,
      credentials: encryptedCreds,
      status: "pending",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, deploymentId: docRef.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
