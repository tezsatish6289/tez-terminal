import assert from "node:assert/strict";
import { mapWithConcurrency } from "../../src/lib/async-pool";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Preserves order regardless of completion timing.
  {
    const out = await mapWithConcurrency([5, 1, 3], 3, async (x) => {
      await delay(x);
      return x * 10;
    });
    assert.deepEqual(out, [50, 10, 30]);
  }

  // Never exceeds the concurrency limit; still processes everything.
  {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 4, async (x) => {
      active++;
      peak = Math.max(peak, active);
      await delay(2);
      active--;
      return x;
    });
    assert.equal(out.length, 20);
    assert.deepEqual(out, items);
    assert.ok(peak <= 4, `peak concurrency ${peak} exceeded limit 4`);
    assert.ok(peak >= 2, `expected real parallelism, peak was ${peak}`);
  }

  // Empty input → empty output, no calls.
  {
    let calls = 0;
    const out = await mapWithConcurrency([], 4, async (x) => {
      calls++;
      return x;
    });
    assert.deepEqual(out, []);
    assert.equal(calls, 0);
  }

  // limit larger than items is clamped (no crash, all run).
  {
    const out = await mapWithConcurrency([1, 2], 99, async (x) => x + 1);
    assert.deepEqual(out, [2, 3]);
  }

  console.log("async-pool.test.ts passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
