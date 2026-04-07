/**
 * SOLANA WALLET SETUP SCRIPT
 * ──────────────────────────
 * Generates a fresh Solana keypair for the Tez Terminal blockchain publisher.
 * Run this ONCE to create your wallet. Keep the output SAFE.
 *
 * Usage:
 *   node scripts/setup-solana-wallet.mjs
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const keypair = Keypair.generate();

const address    = keypair.publicKey.toBase58();
const privateKey = bs58.encode(keypair.secretKey);   // base58 — paste into .env.local

const divider = "═".repeat(58);

console.log(`
${divider}
  TEZ TERMINAL — SOLANA WALLET SETUP
${divider}

✅  New wallet generated successfully!

────────────────────────────────────────────────────────
 STEP 1 — SAVE YOUR PRIVATE KEY (⚠️  NEVER SHARE THIS)
────────────────────────────────────────────────────────

  Open your  .env.local  file and add this line:

  SOLANA_PRIVATE_KEY=${privateKey}

  ⚠️  WARNING: Anyone who has this key controls the wallet.
      Keep it secret. Do not commit it to Git.

────────────────────────────────────────────────────────
 STEP 2 — ADD YOUR HELIUS RPC URL
────────────────────────────────────────────────────────

  1. Go to  https://helius.dev  and create a FREE account
  2. Click "New API Key" → choose  Mainnet
  3. Copy your API key and add this line to  .env.local:

  SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=PASTE_YOUR_KEY_HERE

────────────────────────────────────────────────────────
 STEP 3 — FUND YOUR WALLET WITH SOL
────────────────────────────────────────────────────────

  Your wallet address (safe to share — this is PUBLIC):

  ${address}

  Send at least  0.1 SOL  to this address.
  You can buy SOL on Coinbase, Binance, Kraken, etc.
  then send it to the address above.

  Each trade publish costs ~0.000005 SOL (~$0.001).
  0.1 SOL covers ~20,000 trade publications.

────────────────────────────────────────────────────────
 STEP 4 — VERIFY SETUP
────────────────────────────────────────────────────────

  After funding, check your balance at:
  https://solscan.io/account/${address}

  Then hit your cron endpoint to confirm:
  /api/cron/blockchain-publish?key=YOUR_CRON_SECRET

${divider}
`);
