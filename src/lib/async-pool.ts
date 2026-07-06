/**
 * Run an async mapper over items with a bounded concurrency.
 *
 * Preserves input order in the results and never runs more than `limit` tasks
 * at once — used to parallelize I/O (e.g. GCS reads) without a stampede. Pure
 * (no external deps) so it can be unit-tested directly.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results = new Array<R>(n);
  if (n === 0) return results;

  const workers = Math.max(1, Math.min(limit, n));
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= n) return;
      results[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
