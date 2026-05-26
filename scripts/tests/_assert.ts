/**
 * Minimal test harness for `tsx scripts/tests/*.test.ts`.
 *
 * Zero deps, sync-only, file-local. Each test file uses `describe` +
 * `test` and ends with `summary()`; exit code is 0 on all-pass and 1
 * otherwise so CI / shell composition works without a framework.
 *
 * Picked over `node:test` because the project already runs every other
 * verification script through `tsx` and we want one consistent entry
 * point. Pretty output (✓ green / ✗ red) keeps signal high without a
 * reporter dep.
 */
type TestFn = () => void | Promise<void>;

let passed = 0;
let failed = 0;
const failures: { name: string; err: unknown }[] = [];
let currentDescribe = "";

const COLOR_GREEN = "\x1b[32m";
const COLOR_RED = "\x1b[31m";
const COLOR_DIM = "\x1b[2m";
const COLOR_RESET = "\x1b[0m";

function fmtErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function describe(name: string, fn: () => void): void {
  const prev = currentDescribe;
  currentDescribe = name;
  console.log(`\n${COLOR_DIM}${name}${COLOR_RESET}`);
  try {
    fn();
  } finally {
    currentDescribe = prev;
  }
}

export function test(name: string, fn: TestFn): void {
  const full = currentDescribe ? `${currentDescribe} › ${name}` : name;
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === "function") {
      throw new Error(`async tests not supported: ${full}`);
    }
    passed++;
    console.log(`  ${COLOR_GREEN}✓${COLOR_RESET} ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name: full, err });
    console.log(`  ${COLOR_RED}✗${COLOR_RESET} ${name}`);
    console.log(`    ${COLOR_RED}${fmtErr(err)}${COLOR_RESET}`);
  }
}

export function summary(label = "tests"): void {
  const total = passed + failed;
  const head = failed === 0 ? COLOR_GREEN : COLOR_RED;
  console.log(
    `\n${head}${passed}/${total} ${label} passed${COLOR_RESET}` +
      (failed > 0 ? ` ${COLOR_RED}(${failed} failed)${COLOR_RESET}` : ""),
  );
  if (failed > 0) {
    console.log(`\n${COLOR_RED}Failures:${COLOR_RESET}`);
    for (const f of failures) {
      console.log(`  - ${f.name}\n    ${fmtErr(f.err)}`);
    }
    process.exit(1);
  }
}

export function assertEqual<T>(actual: T, expected: T, label?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function assertDeepEqual<T>(
  actual: T,
  expected: T,
  label?: string,
): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${label ? label + ":\n  " : ""}deep mismatch\n  expected: ${e}\n  actual:   ${a}`,
    );
  }
}

export function assertTrue(cond: boolean, label?: string): void {
  if (!cond) throw new Error(`${label ?? "expected true, got false"}`);
}

export function assertFalse(cond: boolean, label?: string): void {
  if (cond) throw new Error(`${label ?? "expected false, got true"}`);
}
