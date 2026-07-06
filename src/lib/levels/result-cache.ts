/**
 * A tiny process-global cache with TTL + request coalescing (single-flight).
 *
 * Used to share expensive assembled results (Firestore reads + merge/slice)
 * across concurrent callers: within the TTL everyone gets the cached value, and
 * concurrent misses trigger exactly one `produce()` call.
 *
 * Pure and dependency-light (injectable clock) so it can be unit-tested.
 */

interface Entry<T> {
  value: T;
  expires: number;
}

export interface SingleFlightCache<T> {
  get(
    key: string,
    ttlMs: number,
    produce: () => Promise<T>,
    shouldCache?: (value: T) => boolean,
  ): Promise<T>;
  /** Test/introspection helpers. */
  size(): number;
  clear(): void;
}

export function createSingleFlightCache<T>(opts?: { now?: () => number }): SingleFlightCache<T> {
  const now = opts?.now ?? Date.now;
  const cache = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  async function get(
    key: string,
    ttlMs: number,
    produce: () => Promise<T>,
    shouldCache: (value: T) => boolean = () => true,
  ): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.value;

    const existing = inflight.get(key);
    if (existing) return existing;

    // Only one inflight entry per key exists at a time (concurrent callers get
    // `existing` above), so an unconditional delete in `finally` is safe and
    // ensures a failed produce never wedges the key.
    const promise = (async () => {
      try {
        const value = await produce();
        if (shouldCache(value)) cache.set(key, { value, expires: now() + ttlMs });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }

  return {
    get,
    size: () => cache.size,
    clear: () => {
      cache.clear();
      inflight.clear();
    },
  };
}
