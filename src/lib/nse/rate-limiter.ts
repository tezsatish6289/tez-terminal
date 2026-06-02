/**
 * Global, in-process token-bucket rate limiter for NSE traffic.
 *
 * This is the first line of defence against IP blocks: every NSE call (across
 * all callers in the same worker process) must acquire a token first. It caps
 * burst + sustained rate regardless of how many symbols a job tries to fetch.
 *
 * NOTE: this is per-process (per serverless instance / per worker). It is NOT a
 * cluster-wide limit — the Firestore circuit breaker handles cross-instance
 * coordination. For a single dedicated stock cron/worker, one bucket is enough.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity;
    this.lastRefillMs = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefillMs = now;
  }

  /** Block until a token is available, or throw after `maxWaitMs`. */
  async acquire(maxWaitMs: number): Promise<void> {
    const startedAt = Date.now();
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      if (Date.now() - startedAt > maxWaitMs) {
        throw new Error(
          `NSE rate limiter: timed out after ${maxWaitMs}ms waiting for a token`,
        );
      }
      await sleep(200);
    }
  }
}

/**
 * Singleton bucket. Defaults are deliberately conservative:
 *   • capacity (burst)        = 5 calls
 *   • refill                  = 20 calls / minute  → ~1 call / 3s sustained
 * Tune via env without a redeploy:
 *   NSE_RATE_BURST, NSE_RATE_PER_MIN, NSE_RATE_MAX_WAIT_MS
 */
let bucket: TokenBucket | null = null;

function getBucket(): TokenBucket {
  if (!bucket) {
    const burst = envNum("NSE_RATE_BURST", 5);
    const perMin = envNum("NSE_RATE_PER_MIN", 20);
    bucket = new TokenBucket(burst, perMin / 60);
  }
  return bucket;
}

/** Acquire one NSE request token (await before every NSE HTTP call). */
export function acquireNseToken(): Promise<void> {
  const maxWaitMs = envNum("NSE_RATE_MAX_WAIT_MS", 30_000);
  return getBucket().acquire(maxWaitMs);
}
