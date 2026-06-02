/**
 * Firestore-backed circuit breaker for NSE traffic.
 *
 * Cross-instance coordination layer (the rate limiter is per-process; this is
 * shared state). When NSE starts blocking us (`{}`, HTML, 403/429), any caller
 * trips the breaker; every NSE job then refuses to call NSE until `blockedUntil`
 * passes. Backoff grows with consecutive blocks so we don't hammer a hostile WAF.
 *
 * State doc: `config/nse_fetch_state`
 *   { blockedUntil: ISO|null, consecutiveBlocks: number, lastError: string|null, updatedAt: ISO }
 *
 * Designed to never throw into a caller's happy path: read/write failures
 * degrade to "breaker closed" so a Firestore hiccup can't wedge the pipeline.
 */

import type { Firestore } from "firebase-admin/firestore";
import { NseCircuitOpenError } from "./types";

const STATE_DOC = "config/nse_fetch_state";

/** Backoff schedule (minutes) indexed by consecutive block count. Caps at last. */
const BACKOFF_MINUTES = [5, 15, 60];

interface BreakerState {
  blockedUntil: string | null;
  consecutiveBlocks: number;
  lastError: string | null;
  updatedAt: string;
}

function backoffMs(consecutiveBlocks: number): number {
  const idx = Math.min(consecutiveBlocks - 1, BACKOFF_MINUTES.length - 1);
  const mins = BACKOFF_MINUTES[Math.max(0, idx)];
  return mins * 60_000;
}

async function readState(db: Firestore): Promise<BreakerState | null> {
  try {
    const snap = await db.doc(STATE_DOC).get();
    return snap.exists ? (snap.data() as BreakerState) : null;
  } catch {
    return null;
  }
}

/**
 * Throw `NseCircuitOpenError` if the breaker is currently open. Call once at the
 * start of a batch (and optionally between symbols). Fails open on read errors.
 */
export async function assertNseCircuitClosed(db: Firestore): Promise<void> {
  const state = await readState(db);
  if (!state?.blockedUntil) return;
  const until = Date.parse(state.blockedUntil);
  if (Number.isFinite(until) && until > Date.now()) {
    throw new NseCircuitOpenError(state.blockedUntil);
  }
}

/** Non-throwing variant — returns true when NSE calls are currently allowed. */
export async function isNseCircuitClosed(db: Firestore): Promise<boolean> {
  const state = await readState(db);
  if (!state?.blockedUntil) return true;
  const until = Date.parse(state.blockedUntil);
  return !(Number.isFinite(until) && until > Date.now());
}

/** Record a block: bump consecutive count and extend `blockedUntil` with backoff. */
export async function recordNseBlock(db: Firestore, error: string): Promise<void> {
  try {
    const prev = await readState(db);
    const consecutiveBlocks = (prev?.consecutiveBlocks ?? 0) + 1;
    const blockedUntil = new Date(Date.now() + backoffMs(consecutiveBlocks)).toISOString();
    const next: BreakerState = {
      blockedUntil,
      consecutiveBlocks,
      lastError: error.slice(0, 500),
      updatedAt: new Date().toISOString(),
    };
    await db.doc(STATE_DOC).set(next);
  } catch {
    /* breaker write best-effort — never throw into caller */
  }
}

/** Record a success: reset the breaker so the next block starts fresh. */
export async function recordNseSuccess(db: Firestore): Promise<void> {
  try {
    const prev = await readState(db);
    // Only write when there's something to clear — avoids needless writes.
    if (!prev || (prev.consecutiveBlocks === 0 && !prev.blockedUntil)) return;
    const next: BreakerState = {
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    await db.doc(STATE_DOC).set(next);
  } catch {
    /* best-effort */
  }
}
