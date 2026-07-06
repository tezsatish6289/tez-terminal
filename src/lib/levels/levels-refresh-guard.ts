/**
 * Per-key single-flight + throttle guard for background recomputes.
 *
 * Used by the levels endpoint's stale-while-revalidate path: many concurrent
 * chart opens for the same symbol should trigger at most one background NSE
 * recompute, and not re-trigger within a short window. In-process only (one
 * `Map` per server instance); across instances a few duplicate computes are
 * acceptable since the underlying writes are idempotent.
 */

export interface RefreshGuard {
  /**
   * Run `fn` for `key` unless a run is already in flight or one started within
   * `minIntervalMs`. Resolves to `true` when it actually ran `fn`, `false` when
   * skipped. Never rejects — `fn` errors are swallowed (best-effort refresh).
   */
  run(key: string, fn: () => Promise<unknown>, now?: number): Promise<boolean>;
}

export function createRefreshGuard(opts?: {
  minIntervalMs?: number;
  now?: () => number;
}): RefreshGuard {
  const minIntervalMs = opts?.minIntervalMs ?? 15_000;
  const clock = opts?.now ?? Date.now;
  const state = new Map<string, { inFlight: boolean; lastStartMs: number }>();

  return {
    async run(key, fn, now = clock()) {
      const prev = state.get(key);
      if (prev?.inFlight) return false;
      if (prev && now - prev.lastStartMs < minIntervalMs) return false;

      state.set(key, { inFlight: true, lastStartMs: now });
      try {
        await fn();
      } catch {
        /* best-effort: freshness/computedAt throttles retries */
      } finally {
        const cur = state.get(key);
        if (cur) cur.inFlight = false;
      }
      return true;
    },
  };
}
