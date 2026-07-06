import assert from "node:assert/strict";
import { createRefreshGuard } from "../../src/lib/levels/levels-refresh-guard";

/** A promise whose resolution we control, to hold a run "in flight". */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function main() {
  // Single-flight: while a run is in flight, concurrent runs are skipped.
  {
    let clock = 1000;
    const guard = createRefreshGuard({ minIntervalMs: 100, now: () => clock });
    const d = deferred();
    let calls = 0;

    const first = guard.run("SYM", async () => {
      calls++;
      await d.promise;
    });
    // Second call while first still pending → skipped.
    const secondRan = await guard.run("SYM", async () => {
      calls++;
    });
    assert.equal(secondRan, false, "in-flight run is skipped");
    assert.equal(calls, 1, "only the first run's fn started");

    d.resolve();
    const firstRan = await first;
    assert.equal(firstRan, true, "first run reports it ran");
  }

  // Throttle: after a run finishes, re-running within minInterval is skipped.
  {
    let clock = 1000;
    const guard = createRefreshGuard({ minIntervalMs: 100, now: () => clock });
    let calls = 0;
    const fn = async () => {
      calls++;
    };

    assert.equal(await guard.run("SYM", fn), true, "first run executes");
    assert.equal(calls, 1);

    clock += 50; // within minInterval
    assert.equal(await guard.run("SYM", fn), false, "throttled within minInterval");
    assert.equal(calls, 1);

    clock += 60; // now 110ms since start → past minInterval
    assert.equal(await guard.run("SYM", fn), true, "runs again after minInterval");
    assert.equal(calls, 2);
  }

  // Independent keys don't block each other.
  {
    let clock = 1000;
    const guard = createRefreshGuard({ minIntervalMs: 100, now: () => clock });
    let a = 0;
    let b = 0;
    assert.equal(await guard.run("A", async () => void a++), true);
    assert.equal(await guard.run("B", async () => void b++), true);
    assert.equal(a, 1);
    assert.equal(b, 1);
  }

  // fn errors are swallowed and still report as "ran" (releases in-flight).
  {
    let clock = 1000;
    const guard = createRefreshGuard({ minIntervalMs: 0, now: () => clock });
    const ran = await guard.run("SYM", async () => {
      throw new Error("boom");
    });
    assert.equal(ran, true, "errored run still resolves true");
    // in-flight released → a fresh run is allowed (minInterval 0).
    let calls = 0;
    assert.equal(
      await guard.run("SYM", async () => void calls++),
      true,
      "in-flight released after error",
    );
    assert.equal(calls, 1);
  }

  console.log("levels-refresh-guard.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
