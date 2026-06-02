/**
 * Shared NSE client — the single safe entry point for NSE JSON traffic.
 *
 * Composes the three safety layers so every future caller (equity/stock zones,
 * on-demand lookups, …) inherits identical protection:
 *   1. Circuit breaker  (Firestore)  — global pause when NSE is blocking us.
 *   2. Rate limiter      (in-process) — token bucket caps burst + sustained rate.
 *   3. Session reuse                  — ONE cookie bootstrap per batch, reused
 *                                       for every symbol (never per-request).
 *   4. Block detection                — `{}` / HTML / 4xx trips the breaker.
 *
 * Reuses the battle-tested `getNseCookies` handshake and the proxy-aware
 * `nseFetch` (honours `NSE_HTTPS_PROXY`) without modifying them, so the existing
 * crypto / index paths are completely untouched by this module.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getNseCookies, API_HEADERS } from "@/lib/nse-session";
import { nseFetch } from "@/lib/nse-fetch";
import { acquireNseToken } from "./rate-limiter";
import {
  assertNseCircuitClosed,
  recordNseBlock,
  recordNseSuccess,
} from "./circuit-breaker";
import {
  NseBlockError,
  classifyNseBody,
  isBlockKind,
} from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface NseSessionOptions {
  /** Per-request timeout (ms). Default 20s. */
  timeoutMs?: number;
  /**
   * Consecutive block tolerance before the session aborts the whole batch.
   * Default 2 — a single transient `{}` retries, but a real block stops fast.
   */
  maxConsecutiveBlocks?: number;
}

export interface NseSession {
  /** Fetch + parse a JSON endpoint with full protection. Throws NseBlockError on block. */
  fetchJson<T>(url: string): Promise<T>;
  /** Cookie jar in use (debug/inspection only). */
  readonly cookies: string;
}

/**
 * Bootstrap an NSE session ONCE, then reuse it for many symbols.
 *
 * Throws `NseCircuitOpenError` immediately if the breaker is open (no NSE calls
 * are made), so a blocked window costs nothing.
 */
export async function createNseSession(
  db: Firestore,
  opts: NseSessionOptions = {},
): Promise<NseSession> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxConsecutiveBlocks = opts.maxConsecutiveBlocks ?? 2;

  // 1. Refuse to even bootstrap if NSE is currently blocking us.
  await assertNseCircuitClosed(db);

  // 2. One cookie handshake for the whole batch.
  const cookies = await getNseCookies();
  if (!cookies.trim()) {
    const msg = "NSE session bootstrap returned no cookies";
    await recordNseBlock(db, msg);
    throw new NseBlockError("empty", msg);
  }

  let consecutiveBlocks = 0;

  async function fetchJson<T>(url: string): Promise<T> {
    // Rate-limit gate (await a token before touching NSE).
    await acquireNseToken();

    let status = 0;
    let body = "";
    try {
      const res = await nseFetch(url, {
        headers: { ...API_HEADERS, Cookie: cookies },
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      body = await res.text();
    } catch (e) {
      // Network/timeout — treat as a soft failure, not a hard block (don't trip
      // the breaker on a single flaky request), but surface it to the caller.
      const msg = e instanceof Error ? e.message : String(e);
      throw new NseBlockError("http_error", `NSE request failed: ${msg}`, null);
    }

    const kind = classifyNseBody(status, body);

    if (isBlockKind(kind)) {
      consecutiveBlocks += 1;
      const msg = `NSE ${kind} (HTTP ${status}) for ${url}`;
      if (consecutiveBlocks >= maxConsecutiveBlocks) {
        // Real block pattern — trip the shared breaker so all jobs back off.
        await recordNseBlock(db, msg);
      }
      throw new NseBlockError(kind, msg, status);
    }

    // Success — reset local + shared block state.
    consecutiveBlocks = 0;
    await recordNseSuccess(db);

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new NseBlockError("non_json", `NSE returned unparseable JSON for ${url}`, status);
    }
  }

  return { fetchJson, cookies };
}

export interface NseBatchOptions extends NseSessionOptions {
  /** Delay between symbols (ms). Default 2500. */
  delayMs?: number;
  /** +/- random jitter applied to delay (ms). Default 750. */
  jitterMs?: number;
}

export interface NseBatchItemResult<R> {
  symbol: string;
  ok: boolean;
  data?: R;
  error?: string;
}

export interface NseBatchResult<R> {
  results: NseBatchItemResult<R>[];
  /** Set when the batch aborted early (breaker tripped / block detected). */
  abortedReason: string | null;
}

/**
 * Drain a list of symbols SERIALLY through one reused session, with jittered
 * delays between calls and early-abort on block. This is the safe primitive the
 * stock-zones cron will use — never parallel-fan-out to NSE.
 */
export async function runNseBatch<R>(
  db: Firestore,
  symbols: string[],
  worker: (symbol: string, session: NseSession) => Promise<R>,
  opts: NseBatchOptions = {},
): Promise<NseBatchResult<R>> {
  const delayMs = opts.delayMs ?? 2_500;
  const jitterMs = opts.jitterMs ?? 750;
  const results: NseBatchItemResult<R>[] = [];

  let session: NseSession;
  try {
    session = await createNseSession(db, opts);
  } catch (e) {
    return {
      results: symbols.map((symbol) => ({ symbol, ok: false, error: "session not established" })),
      abortedReason: e instanceof Error ? e.message : String(e),
    };
  }

  let aborted: string | null = null;

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      const data = await worker(symbol, session);
      results.push({ symbol, ok: true, data });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ symbol, ok: false, error });
      // A confirmed block aborts the rest of the batch — protect the IP.
      if (e instanceof NseBlockError && e.status !== null) {
        aborted = `Aborted after block on ${symbol}: ${error}`;
        // Mark remaining symbols as skipped.
        for (let j = i + 1; j < symbols.length; j++) {
          results.push({ symbol: symbols[j], ok: false, error: "skipped (batch aborted)" });
        }
        break;
      }
    }

    if (i < symbols.length - 1) {
      const jitter = Math.round((Math.random() * 2 - 1) * jitterMs);
      await sleep(Math.max(0, delayMs + jitter));
    }
  }

  return { results, abortedReason: aborted };
}
