/**
 * Pull sr_zone_events via Firestore REST (gcloud user token) and calibrate
 * Atlas score vs win-rate / MFE for customer profitability guidance.
 *
 * Usage:
 *   TOKEN=$(gcloud auth print-access-token) \
 *   npx tsx scripts/analyze-sr-audit-profitability.ts
 */
import { scoreDirectionalSetup } from "../src/lib/levels/strategy-score";
import { scoreInputsFromSrEvent } from "../src/lib/levels/strategy-score-adapters";
import { srEventOutcome } from "../src/lib/sr-audit/pnl";
import type { SrZoneEvent } from "../src/lib/sr-audit/types";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "studio-6235588950-a15f2";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

type Row = SrZoneEvent & { id: string; score: number; outcome: "win" | "loss" | "open" };

function decodeValue(v: Record<string, unknown>): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return arr.map(decodeValue);
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields ?? {};
    return decodeMap(fields);
  }
  return null;
}

function decodeMap(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

async function fetchAllEvents(token: string, limit = 500): Promise<Row[]> {
  const rows: Row[] = [];
  let pageToken: string | undefined;
  while (rows.length < limit) {
    const pageSize = Math.min(100, limit - rows.length);
    const url = new URL(`${BASE}/sr_zone_events`);
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("orderBy", "eventAt desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Firestore REST ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      documents?: { name: string; fields: Record<string, Record<string, unknown>> }[];
      nextPageToken?: string;
    };
    for (const doc of json.documents ?? []) {
      const id = doc.name.split("/").pop()!;
      const e = decodeMap(doc.fields) as unknown as SrZoneEvent;
      const score = scoreDirectionalSetup(e.side, scoreInputsFromSrEvent(e), {
        riskReward: e.entryRr ?? null,
      }).composite;
      rows.push({ ...e, id, score, outcome: srEventOutcome(e) });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return rows;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function pctile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.floor((p / 100) * (a.length - 1))));
  return a[i]!;
}

function round(n: number | null, d = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function bucketStats(rows: Row[], label: string) {
  const resolved = rows.filter((r) => r.outcome === "win" || r.outcome === "loss");
  const wins = resolved.filter((r) => r.outcome === "win");
  const losses = resolved.filter((r) => r.outcome === "loss");
  const open = rows.filter((r) => r.outcome === "open");
  const mfeAll = resolved
    .map((r) => r.maxFavorablePct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const maeAll = resolved
    .map((r) => r.maxAdversePct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const mfeWins = wins
    .map((r) => r.maxFavorablePct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const mfeLoss = losses
    .map((r) => r.maxFavorablePct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const maeLoss = losses
    .map((r) => r.maxAdversePct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const finalPnl = resolved
    .map((r) => r.finalPnlPct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const rr = resolved.map((r) => r.entryRr).filter((v): v is number => v != null && Number.isFinite(v));
  const pocHit = resolved.filter((r) => r.hitPoc || r.reachedTarget).length;
  const inv = resolved.filter((r) => r.resolveReason === "invalidation").length;
  const flip = resolved.filter((r) => r.resolveReason === "zone_flip").length;

  const wr = resolved.length ? wins.length / resolved.length : null;
  const winMfe = mean(mfeWins) ?? 0;
  const lossMae = mean(maeLoss) ?? 0;
  const expectancyProxy = wr == null ? null : wr * winMfe - (1 - wr) * lossMae;

  // Avg MFE captured before invalidation on losses (gave-back potential)
  return {
    label,
    n: rows.length,
    resolved: resolved.length,
    open: open.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round(wr == null ? null : wr * 100, 1),
    medianMfe: round(median(mfeAll)),
    meanMfe: round(mean(mfeAll)),
    p75Mfe: round(pctile(mfeAll, 75)),
    p90Mfe: round(pctile(mfeAll, 90)),
    medianMae: round(median(maeAll)),
    meanMae: round(mean(maeAll)),
    medianMfeWins: round(median(mfeWins)),
    meanMfeWins: round(mean(mfeWins)),
    medianMfeLosses: round(median(mfeLoss)),
    meanMaeLosses: round(mean(maeLoss)),
    meanFinalPnl: round(mean(finalPnl)),
    medianFinalPnl: round(median(finalPnl)),
    expectancyProxy: round(expectancyProxy),
    medianRr: round(median(rr)),
    meanRr: round(mean(rr)),
    pocHitRate: round(resolved.length ? (pocHit / resolved.length) * 100 : null, 1),
    invRate: round(resolved.length ? (inv / resolved.length) * 100 : null, 1),
    flipRate: round(resolved.length ? (flip / resolved.length) * 100 : null, 1),
    mfeGt3Rate: round(mfeAll.length ? (mfeAll.filter((v) => v > 3).length / mfeAll.length) * 100 : null, 1),
    mfeGt5Rate: round(mfeAll.length ? (mfeAll.filter((v) => v > 5).length / mfeAll.length) * 100 : null, 1),
  };
}

async function main() {
  const token = process.env.TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (!token) {
    console.error("Set TOKEN=$(gcloud auth print-access-token)");
    process.exit(1);
  }

  const rows = await fetchAllEvents(token, 500);
  const SCORE_BUCKETS = [
    { label: "0–49", min: 0, max: 49 },
    { label: "50–69", min: 50, max: 69 },
    { label: "70–100", min: 70, max: 100 },
  ];
  const FINE = [
    { label: "0–39", min: 0, max: 39 },
    { label: "40–49", min: 40, max: 49 },
    { label: "50–59", min: 50, max: 59 },
    { label: "60–69", min: 60, max: 69 },
    { label: "70–79", min: 70, max: 79 },
    { label: "80–100", min: 80, max: 100 },
  ];

  const resolved = rows.filter((r) => r.outcome === "win" || r.outcome === "loss");
  const dates = rows.map((r) => r.eventAt).filter(Boolean).sort();
  const scores = rows.map((r) => r.score);

  const byCoarse = SCORE_BUCKETS.map((b) =>
    bucketStats(
      rows.filter((r) => r.score >= b.min && r.score <= b.max),
      b.label,
    ),
  );
  const byFine = FINE.map((b) =>
    bucketStats(
      rows.filter((r) => r.score >= b.min && r.score <= b.max),
      b.label,
    ),
  );
  const bySide = ["support", "resistance"].map((side) =>
    bucketStats(
      rows.filter((r) => r.side === side),
      side,
    ),
  );
  const bySideScore = ["support", "resistance"].flatMap((side) =>
    SCORE_BUCKETS.map((b) =>
      bucketStats(
        rows.filter((r) => r.side === side && r.score >= b.min && r.score <= b.max),
        `${side} ${b.label}`,
      ),
    ),
  );
  const rrBuckets = [
    { label: "RR <1.5", pred: (r: Row) => (r.entryRr ?? 0) > 0 && (r.entryRr ?? 0) < 1.5 },
    { label: "RR 1.5–2.5", pred: (r: Row) => (r.entryRr ?? 0) >= 1.5 && (r.entryRr ?? 0) < 2.5 },
    { label: "RR 2.5–4", pred: (r: Row) => (r.entryRr ?? 0) >= 2.5 && (r.entryRr ?? 0) < 4 },
    { label: "RR ≥4", pred: (r: Row) => (r.entryRr ?? 0) >= 4 },
    { label: "RR missing", pred: (r: Row) => r.entryRr == null || !Number.isFinite(r.entryRr) },
  ].map((b) => bucketStats(rows.filter(b.pred), b.label));

  const pvtBuckets = [
    bucketStats(
      rows.filter((r) => r.entryPvtSlope != null && Number.isFinite(r.entryPvtSlope)),
      "PVT present",
    ),
    bucketStats(
      rows.filter((r) => r.entryPvtSlope == null || !Number.isFinite(r.entryPvtSlope)),
      "PVT missing",
    ),
  ];

  // PVT aligned with side
  const pvtAligned = bucketStats(
    rows.filter((r) => {
      if (r.entryPvtSlope == null || !Number.isFinite(r.entryPvtSlope)) return false;
      return r.side === "support" ? r.entryPvtSlope > 0 : r.entryPvtSlope < 0;
    }),
    "PVT aligned",
  );
  const pvtAgainst = bucketStats(
    rows.filter((r) => {
      if (r.entryPvtSlope == null || !Number.isFinite(r.entryPvtSlope)) return false;
      return r.side === "support" ? r.entryPvtSlope < 0 : r.entryPvtSlope > 0;
    }),
    "PVT against",
  );

  const pvtAlignedPred = (r: Row) =>
    r.entryPvtSlope != null &&
    Number.isFinite(r.entryPvtSlope) &&
    (r.side === "support" ? r.entryPvtSlope > 0 : r.entryPvtSlope < 0);
  const pvtAgainstPred = (r: Row) =>
    r.entryPvtSlope != null &&
    Number.isFinite(r.entryPvtSlope) &&
    (r.side === "support" ? r.entryPvtSlope < 0 : r.entryPvtSlope > 0);
  const rrOk = (r: Row) => r.entryRr == null || !Number.isFinite(r.entryRr) || r.entryRr <= 2.5;

  const filters = [
    bucketStats(rows.filter((r) => r.score >= 70), "trade if score≥70"),
    bucketStats(rows.filter((r) => r.score >= 60), "trade if score≥60"),
    bucketStats(rows.filter((r) => r.score >= 50), "trade if score≥50"),
    bucketStats(rows.filter((r) => r.score < 50), "avoid score<50"),
    bucketStats(rows.filter((r) => r.score >= 60 && pvtAlignedPred(r)), "score≥60 & PVT aligned"),
    bucketStats(rows.filter((r) => r.score >= 70 && pvtAlignedPred(r)), "score≥70 & PVT aligned"),
    bucketStats(rows.filter((r) => r.score >= 60 && !pvtAgainstPred(r)), "score≥60 & !PVT against"),
    bucketStats(rows.filter((r) => r.score >= 60 && rrOk(r)), "score≥60 & RR≤2.5"),
    bucketStats(
      rows.filter((r) => r.score >= 60 && pvtAlignedPred(r) && rrOk(r)),
      "score≥60 & PVT aligned & RR≤2.5",
    ),
    bucketStats(rows.filter((r) => r.score >= 70 && (r.entryRr ?? 0) >= 2.5), "score≥70 & RR≥2.5"),
    bucketStats(rows.filter((r) => r.score >= 70 && r.side === "resistance"), "score≥70 resistance"),
  ];

  // Among wins: how much of MFE is kept at resolve (giveback problem)
  const winsWithBoth = resolved.filter(
    (r) =>
      r.outcome === "win" &&
      r.maxFavorablePct != null &&
      r.finalPnlPct != null &&
      Number.isFinite(r.maxFavorablePct) &&
      Number.isFinite(r.finalPnlPct) &&
      r.maxFavorablePct > 0,
  );
  const captureRatios = winsWithBoth.map((r) => (r.finalPnlPct as number) / (r.maxFavorablePct as number));
  const givebacks = winsWithBoth.map((r) => (r.maxFavorablePct as number) - (r.finalPnlPct as number));
  const winCapture = {
    n: winsWithBoth.length,
    medianCapturePct: round(median(captureRatios) == null ? null : (median(captureRatios) as number) * 100, 1),
    medianGivebackPctPts: round(median(givebacks)),
    meanGivebackPctPts: round(mean(givebacks)),
  };

  const byScope = ["stock", "index"].map((scope) =>
    bucketStats(
      rows.filter((r) => (r.scope ?? "stock") === scope),
      scope,
    ),
  );

  const volBuckets = ["CALM", "ELEVATED", "EARNINGS", "UNKNOWN", "missing"].map((flag) =>
    bucketStats(
      rows.filter((r) => {
        const f = (r.volRegimeFlag ?? "").toUpperCase() || "missing";
        if (flag === "missing") return !r.volRegimeFlag;
        if (flag === "UNKNOWN") return f === "UNKNOWN" || f === "";
        return f === flag;
      }),
      `vol ${flag}`,
    ),
  );

  // Holding: days to resolve
  const holdDays = resolved
    .map((r) => {
      if (!r.eventAt || !r.resolvedAt) return null;
      const d = (Date.parse(r.resolvedAt) - Date.parse(r.eventAt)) / 86_400_000;
      return Number.isFinite(d) ? d : null;
    })
    .filter((v): v is number => v != null);

  const topWins = [...resolved]
    .filter((r) => r.outcome === "win")
    .sort((a, b) => (b.maxFavorablePct ?? 0) - (a.maxFavorablePct ?? 0))
    .slice(0, 12)
    .map((r) => ({
      symbol: r.symbol,
      side: r.side,
      score: r.score,
      mfe: round(r.maxFavorablePct ?? null),
      mae: round(r.maxAdversePct ?? null),
      rr: round(r.entryRr ?? null),
      eventAt: r.eventAt?.slice(0, 10),
      reason: r.resolveReason,
    }));

  const highScoreLosses = resolved
    .filter((r) => r.score >= 70 && r.outcome === "loss")
    .sort((a, b) => (b.maxAdversePct ?? 0) - (a.maxAdversePct ?? 0))
    .slice(0, 12)
    .map((r) => ({
      symbol: r.symbol,
      side: r.side,
      score: r.score,
      mfe: round(r.maxFavorablePct ?? null),
      mae: round(r.maxAdversePct ?? null),
      rr: round(r.entryRr ?? null),
      eventAt: r.eventAt?.slice(0, 10),
      finalPnl: round(r.finalPnlPct ?? null),
    }));

  // Per-symbol concentration of losses at high score
  const lossBySym: Record<string, number> = {};
  for (const r of resolved.filter((x) => x.score >= 70 && x.outcome === "loss")) {
    lossBySym[r.symbol] = (lossBySym[r.symbol] ?? 0) + 1;
  }
  const topLossSymbols = Object.entries(lossBySym)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, losses]) => ({ symbol, losses }));

  const out = {
    meta: {
      n: rows.length,
      resolved: resolved.length,
      open: rows.filter((r) => r.outcome === "open").length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      scoreDist: {
        min: Math.min(...scores),
        max: Math.max(...scores),
        median: round(median(scores), 1),
        mean: round(mean(scores), 1),
        p25: round(pctile(scores, 25), 1),
        p75: round(pctile(scores, 75), 1),
      },
      holdDays: {
        median: round(median(holdDays), 1),
        mean: round(mean(holdDays), 1),
        p75: round(pctile(holdDays, 75), 1),
      },
    },
    overall: bucketStats(rows, "ALL"),
    byCoarse,
    byFine,
    bySide,
    bySideScore,
    rrBuckets,
    pvtBuckets,
    pvtAligned,
    pvtAgainst,
    filters,
    winCapture,
    byScope,
    volBuckets,
    topWins,
    highScoreLosses,
    topLossSymbols,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
