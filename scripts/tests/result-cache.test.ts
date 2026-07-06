import assert from "node:assert/strict";
import { createSingleFlightCache } from "../../src/lib/levels/result-cache";

const tick = () => new Promise((r) => setTimeout(r, 0));

async function main() {
  // TTL hit: second call within TTL reuses the cached value (produce once).
  {
    let clock = 1000;
    const cache = createSingleFlightCache<number>({ now: () => clock });
    let calls = 0;
    const produce = async () => {
      calls++;
      return 42;
    };
    const a = await cache.get("k", 100, produce);
    const b = await cache.get("k", 100, produce);
    assert.equal(a, 42);
    assert.equal(b, 42);
    assert.equal(calls, 1, "cached within TTL → produced once");
  }

  // Expiry: after TTL elapses, produce runs again.
  {
    let clock = 1000;
    const cache = createSingleFlightCache<number>({ now: () => clock });
    let calls = 0;
    const produce = async () => {
      calls++;
      return calls;
    };
    assert.equal(await cache.get("k", 100, produce), 1);
    clock += 101; // expire
    assert.equal(await cache.get("k", 100, produce), 2, "re-produced after expiry");
  }

  // Single-flight: concurrent misses share one produce call.
  {
    const cache = createSingleFlightCache<number>();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const produce = async () => {
      calls++;
      await gate;
      return 7;
    };
    const p1 = cache.get("k", 1000, produce);
    const p2 = cache.get("k", 1000, produce);
    await tick();
    assert.equal(calls, 1, "concurrent misses coalesce to one produce");
    release();
    assert.deepEqual(await Promise.all([p1, p2]), [7, 7]);
  }

  // shouldCache=false: value is never cached, so every call re-produces.
  {
    const cache = createSingleFlightCache<{ ok: boolean; n: number }>();
    let calls = 0;
    const produce = async () => ({ ok: false, n: ++calls });
    await cache.get("k", 1000, produce, (v) => v.ok);
    await cache.get("k", 1000, produce, (v) => v.ok);
    assert.equal(calls, 2, "failed results are not cached");
    assert.equal(cache.size(), 0);
  }

  // Failure doesn't wedge the key: a rejected produce lets the next call retry.
  {
    const cache = createSingleFlightCache<number>();
    let calls = 0;
    const produce = async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return 5;
    };
    await assert.rejects(() => cache.get("k", 1000, produce));
    const v = await cache.get("k", 1000, produce);
    assert.equal(v, 5, "retry succeeds after a prior failure");
  }

  console.log("result-cache.test.ts passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
