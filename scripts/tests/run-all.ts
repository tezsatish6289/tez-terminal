/**
 * Runs every `scripts/tests/*.test.ts` in a child tsx process and
 * aggregates exit codes. Used by `npm test` so a single failing case in
 * any file fails the run.
 *
 * Per-file isolation matters: each test file ends with `summary()`
 * which calls `process.exit(1)` on failure. If we imported the files
 * into one process the first failure would kill the rest before they
 * could report.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const TESTS_DIR = resolve(__dirname);

function discoverTestFiles(): string[] {
  return readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort()
    .map((f) => join(TESTS_DIR, f));
}

function run(): void {
  const files = discoverTestFiles();
  if (files.length === 0) {
    console.log("no test files found in scripts/tests/");
    return;
  }
  console.log(`Running ${files.length} test file(s)`);
  let failedFiles = 0;
  for (const file of files) {
    const rel = file.replace(`${process.cwd()}/`, "");
    console.log(`\n────────── ${rel} ──────────`);
    const result = spawnSync("npx", ["tsx", file], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) failedFiles++;
  }
  if (failedFiles > 0) {
    console.log(`\n\x1b[31m${failedFiles}/${files.length} files failed\x1b[0m`);
    process.exit(1);
  }
  console.log(`\n\x1b[32mAll ${files.length} test file(s) passed\x1b[0m`);
}

run();
