import type { Firestore } from "firebase-admin/firestore";
import { SR_AUDIT_META_DOC, SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrAuditSummary, SrZoneEvent, SrZoneSide } from "@/lib/sr-audit/types";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function pctHit(count: number, total: number): number | null {
  if (total <= 0) return null;
  return (count / total) * 100;
}

function sideStats(events: SrZoneEvent[], side: SrZoneSide) {
  const rows = events.filter((e) => e.side === side);
  const resolved = rows.filter((e) => e.state === "resolved");
  const invalidations = resolved.filter((e) => e.resolveReason === "invalidation");
  const pocHits = resolved.filter((e) => e.hitPoc === true);
  const mfe = resolved
    .map((e) => e.maxFavorablePct)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const mae = resolved
    .map((e) => e.maxAdversePct)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  return {
    count: rows.length,
    resolved: resolved.length,
    invalidationRate: pctHit(invalidations.length, resolved.length),
    medianMfePct: median(mfe),
    medianMaePct: median(mae),
    pocHitRate: pctHit(pocHits.length, resolved.length),
  };
}

export async function buildSrAuditSummary(
  db: Firestore,
  events: SrZoneEvent[],
): Promise<SrAuditSummary> {
  let lastOutcomeCronAt: string | null = null;
  try {
    const meta = await db.doc(SR_AUDIT_META_DOC).get();
    lastOutcomeCronAt =
      typeof meta.data()?.lastOutcomeCronAt === "string"
        ? meta.data()!.lastOutcomeCronAt
        : null;
  } catch {
    /* ignore */
  }

  const open = events.filter((e) => e.state === "open").length;
  const resolved = events.filter((e) => e.state === "resolved").length;
  const failed = events.filter((e) => e.state === "failed").length;

  return {
    total: events.length,
    open,
    resolved,
    failed,
    support: sideStats(events, "support"),
    resistance: sideStats(events, "resistance"),
    lastOutcomeCronAt,
  };
}

export async function querySrZoneEvents(
  db: Firestore,
  opts: {
    limit?: number;
    state?: string | null;
    side?: string | null;
    symbol?: string | null;
    from?: string | null;
    to?: string | null;
  },
): Promise<SrZoneEvent[]> {
  const fetchLimit = Math.min(500, Math.max(opts.limit ?? 200, 50) * 2);
  const snap = await db
    .collection(SR_ZONE_EVENTS_COLLECTION)
    .orderBy("eventAt", "desc")
    .limit(fetchLimit)
    .get();
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SrZoneEvent & { id: string });

  if (opts.state) {
    rows = rows.filter((r) => r.state === opts.state);
  }
  if (opts.side) {
    rows = rows.filter((r) => r.side === opts.side);
  }

  if (opts.symbol) {
    const sym = opts.symbol.toUpperCase();
    rows = rows.filter((r) => r.symbol === sym);
  }
  if (opts.from) {
    const fromMs = Date.parse(opts.from);
    if (Number.isFinite(fromMs)) {
      rows = rows.filter((r) => Date.parse(r.eventAt) >= fromMs);
    }
  }
  if (opts.to) {
    const toMs = Date.parse(opts.to);
    if (Number.isFinite(toMs)) {
      rows = rows.filter((r) => Date.parse(r.eventAt) <= toMs);
    }
  }

  return rows.slice(0, opts.limit ?? 200);
}
