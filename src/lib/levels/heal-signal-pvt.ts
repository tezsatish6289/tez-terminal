/**
 * Demand-driven self-healing of the confirmed-signal PVT reads.
 *
 * When a symbol's trend chart / Liveslide fetches its levels, we take that as a
 * "we now know this symbol's live truth" event and refresh the PVT levels on its
 * open SR zone event(s):
 *   • currentPvt — recomputed from the shared daily-candle store (today's live
 *     bar merged), so the bubble map / chips converge to the same value the
 *     trend chart shows client-side, without waiting for the post-close cron.
 *   • entryPvt   — backfilled opportunistically if a legacy/new event is missing
 *     it, so the signal can evaluate at all.
 *
 * Server-side + best-effort by design:
 *   • The client's own computed number is never trusted — we recompute here from
 *     our cached candles, so a viewer can't poison the shared signal.
 *   • No extra Dhan load in practice — the daily-candle store is Firestore-backed
 *     with short result/fetch caches, so a viewed symbol is already warm.
 *   • Throttled per-symbol (in-memory) and skipped when unchanged, so many
 *     viewers / fast Liveslide rotations can't cause a Firestore write storm.
 *   • Any failure is swallowed — healing must never break the levels response.
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent, SrZoneSide } from "@/lib/sr-audit/types";
import { fetchDailyPvtPoints } from "@/lib/levels/pvt-signal";
import { pvtValueAt } from "@/lib/levels/pvt";

/** Min gap between heal attempts for a symbol (per server instance). */
const HEAL_MIN_INTERVAL_MS = 60_000;
/** Relative move below this is treated as noise — skip the write. */
const PVT_WRITE_REL_EPS = 1e-6;

const lastHealAt = new Map<string, number>();

function pvtChanged(prev: number | null | undefined, next: number): boolean {
  if (prev == null) return true;
  return Math.abs(next - prev) > Math.abs(next) * PVT_WRITE_REL_EPS;
}

/**
 * Recompute + write back the live PVT reads for a symbol's open SR events.
 * Safe to call on every single-symbol levels request; internally throttled.
 */
export async function healSymbolCurrentPvt(
  db: Firestore,
  scope: "stock" | "index",
  symbol: string,
): Promise<void> {
  const sym = symbol.toUpperCase();
  const now = Date.now();
  if (now - (lastHealAt.get(sym) ?? 0) < HEAL_MIN_INTERVAL_MS) return;
  lastHealAt.set(sym, now);

  try {
    // Reuse the existing symbol+side+state composite index (one limit-1 read per
    // side) rather than requiring a new symbol+state index.
    const sides: SrZoneSide[] = ["support", "resistance"];
    const snaps = await Promise.all(
      sides.map((side) =>
        db
          .collection(SR_ZONE_EVENTS_COLLECTION)
          .where("symbol", "==", sym)
          .where("side", "==", side)
          .where("state", "==", "open")
          .limit(1)
          .get(),
      ),
    );
    const docs = snaps.flatMap((s) => s.docs);
    if (!docs.length) return;

    const pvtPoints = await fetchDailyPvtPoints(scope, sym);
    const currentPvt = pvtPoints?.[pvtPoints.length - 1]?.value ?? null;
    if (pvtPoints == null || currentPvt == null) return;

    const healedAt = new Date(now).toISOString();
    await Promise.all(
      docs.map((d) => {
        const ev = d.data() as SrZoneEvent;
        const patch: Record<string, unknown> = {};

        if (pvtChanged(ev.currentPvt, currentPvt)) {
          patch.currentPvt = currentPvt;
        }
        // Backfill the dip anchor if a legacy/new event never got one — without
        // it the signal can't evaluate at all.
        if (ev.entryPvt == null) {
          const entrySec = Math.floor(Date.parse(ev.eventAt) / 1000);
          const entryPvt = Number.isFinite(entrySec) ? pvtValueAt(pvtPoints, entrySec) : null;
          if (entryPvt != null) patch.entryPvt = entryPvt;
        }

        if (Object.keys(patch).length === 0) return Promise.resolve();
        patch.currentPvtHealedAt = healedAt;
        return d.ref.set(patch, { merge: true });
      }),
    );
  } catch {
    /* best-effort: healing must never break the levels response */
  }
}
