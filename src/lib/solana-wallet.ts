import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// ── Constants ─────────────────────────────────────────────────

export const MIN_BALANCE_SOL = 0.02;

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// ── Singleton instances (module-level cache) ──────────────────

let _keypair: Keypair | null = null;
let _connection: Connection | null = null;

// ── Internal helpers ──────────────────────────────────────────

function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) throw new Error("SOLANA_RPC_URL is not configured in env");
    // Use finalized commitment globally — safest for a proof-of-performance ledger
    _connection = new Connection(rpcUrl, "finalized");
  }
  return _connection;
}

function getKeypair(): Keypair {
  if (!_keypair) {
    const raw = process.env.SOLANA_PRIVATE_KEY;
    if (!raw) throw new Error("SOLANA_PRIVATE_KEY is not configured in env");

    // Auto-detect format:
    //   JSON array  → output of `solana-keygen new` or our setup script
    //   base58 string → output of Phantom / Backpack "Export Private Key"
    const trimmed = raw.trim();
    let secretKey: Uint8Array;

    if (trimmed.startsWith("[")) {
      const arr: number[] = JSON.parse(trimmed);
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error(
          "SOLANA_PRIVATE_KEY: JSON array must contain exactly 64 numbers"
        );
      }
      secretKey = Uint8Array.from(arr);
    } else {
      secretKey = bs58.decode(trimmed);
    }

    _keypair = Keypair.fromSecretKey(secretKey);
  }
  return _keypair;
}

// ── Public API ────────────────────────────────────────────────

/** Returns the wallet's public address (safe to display / log). */
export function getWalletAddress(): string {
  return getKeypair().publicKey.toBase58();
}

/** Returns the current SOL balance of the signing wallet. */
export async function getWalletBalance(): Promise<number> {
  const lamports = await getConnection().getBalance(getKeypair().publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Sends a Memo-program transaction on Solana mainnet and waits for
 * `finalized` commitment before returning.
 *
 * Returns `{ success: true, txHash }` on success, or
 * `{ success: false, error }` on any failure (including LOW_BALANCE).
 * Never throws — all errors are captured in the return value.
 */
export async function sendMemoTransaction(
  memo: string
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  // ── Balance guard ─────────────────────────────────────────
  let balance: number;
  try {
    balance = await getWalletBalance();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SolanaWallet] Balance check failed: ${msg}`);
    return { success: false, error: `Balance check failed: ${msg}` };
  }

  if (balance < MIN_BALANCE_SOL) {
    const address = getWalletAddress();
    console.warn(
      `[SolanaWallet] LOW_BALANCE: ${balance.toFixed(6)} SOL (minimum ${MIN_BALANCE_SOL} SOL). ` +
        `Fund wallet: ${address}`
    );
    return { success: false, error: "LOW_BALANCE" };
  }

  // ── Send transaction ──────────────────────────────────────
  try {
    const connection = getConnection();
    const keypair = getKeypair();

    const tx = new Transaction().add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, "utf-8"),
      })
    );

    // finalized = 32 slots of confirmation, ~13s — irreversible
    const txHash = await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment: "finalized",
    });

    return { success: true, txHash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Generates a plain-English deposit instruction for funding this wallet.
 * Use this to display in admin dashboards or alert messages.
 */
export function getDepositInstruction(): string {
  const address = getWalletAddress();
  const min = MIN_BALANCE_SOL;
  return `Send at least ${min} SOL to: ${address}`;
}
