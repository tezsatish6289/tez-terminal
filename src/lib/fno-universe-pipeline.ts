/**
 * End-to-end F&O universe maintenance:
 *   1. Sync universe from NSE FO pre-open + Dhan scrip master → Firestore
 *   2. Map every symbol to Dhan securityId
 *   3. Rotate option-chain validation (~20 symbols/day)
 *
 * Runs daily from `daily-housekeeping`; admin can trigger the same path manually.
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { createNseSession } from "@/lib/nse/client";
import { invalidateFnoUniverseCache, loadFnoUniverse } from "@/lib/nse/fno-universe-runtime";
import { syncFnoUniverse, type SyncFnoUniverseResult } from "@/lib/nse/fno-universe-sync";
import {
  syncDhanFnoInstruments,
  validateDhanFnoOptionChainsRotating,
  type SyncDhanFnoResult,
  type ValidateDhanFnoResult,
} from "@/lib/dhan-instruments-sync";

export interface FnoUniversePipelineResult {
  universe: SyncFnoUniverseResult;
  dhan: SyncDhanFnoResult;
  validate: ValidateDhanFnoResult;
}

export interface FnoUniversePipelineOptions {
  /** Probe Dhan option-chain expiry API for this many symbols (default 20). */
  validateLimit?: number;
  /** Skip NSE session bootstrap (Dhan-only universe discovery). */
  skipNse?: boolean;
  /** Reuse an existing NSE session (e.g. from daily-housekeeping). */
  session?: Awaited<ReturnType<typeof createNseSession>> | null;
}

export async function runFnoUniversePipeline(
  db: Firestore,
  opts: FnoUniversePipelineOptions = {},
): Promise<FnoUniversePipelineResult> {
  let session = opts.session ?? null;
  if (!opts.skipNse && session == null) {
    try {
      session = await createNseSession(db);
    } catch {
      session = null;
    }
  }

  const universe = await syncFnoUniverse(db, { session });
  invalidateFnoUniverseCache();

  const symbols = await loadFnoUniverse(db);
  const dhan = await syncDhanFnoInstruments(db, { symbols: [...symbols] });
  const validate = await validateDhanFnoOptionChainsRotating(db, {
    symbols: [...symbols],
    limit: opts.validateLimit ?? 20,
  });

  return { universe, dhan, validate };
}

export function summarizeFnoUniversePipeline(r: FnoUniversePipelineResult): string {
  const parts = [
    `universe=${r.universe.total}`,
    `src=${r.universe.source}`,
    `added=${r.universe.added.length}`,
    `removed=${r.universe.removed.length}`,
    `dhan=${r.dhan.mapped}/${r.dhan.total}`,
    `missing=${r.dhan.missing.length}`,
    `validated=${r.validate.ok}/${r.validate.checked}`,
  ];
  if (r.validate.invalid.length) parts.push(`invalid=${r.validate.invalid.length}`);
  return parts.join(" ");
}
