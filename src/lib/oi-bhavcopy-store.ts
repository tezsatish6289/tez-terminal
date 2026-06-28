/**
 * GCS-backed daily bhavcopy cache — the scalable source for OI history.
 *
 * One NSE F&O bhavcopy file covers EVERY symbol (all indices + ~200 stocks) for a
 * trading day. We download it at most once per day, cache the raw zip in Cloud
 * Storage, and derive a compact per-symbol snapshot map. Any number of symbols /
 * users then read from GCS — never NSE.
 *
 * Layered resolution for a date (cheapest first):
 *   1. compact snapshot JSON in GCS         → return (tiny, ~30 KB)
 *   2. raw bhavcopy zip in GCS              → parse, build + cache snapshot, return
 *   3. (opt-in) fetch from NSE             → cache zip + snapshot, return
 *   4. nothing                             → null (holiday / not published / no access)
 *
 * Objects live under `oi-bhavcopy/` in the default Admin bucket:
 *   oi-bhavcopy/{YYYY-MM-DD}.csv.zip          raw NSE zip
 *   oi-bhavcopy/{YYYY-MM-DD}.snapshot.json    { [symbol]: OiHistoryEntry }
 */

import "server-only";
import { getAdminStorageBucket } from "@/firebase/admin";
import { getNseCookies } from "@/lib/nse-session";
import {
  computeAllOiSnapshots,
  fetchFoBhavcopyZip,
  parseFoBhavcopyCsv,
  unzipBhavcopyCsv,
} from "@/lib/nse/fo-bhavcopy";
import type { OiHistoryEntry } from "@/lib/oi-history";

export type DailySnapshotMap = Record<string, OiHistoryEntry>;

const PREFIX = "oi-bhavcopy";

export function bhavcopyZipObject(dateKey: string): string {
  return `${PREFIX}/${dateKey}.csv.zip`;
}

export function dailySnapshotObject(dateKey: string): string {
  return `${PREFIX}/${dateKey}.snapshot.json`;
}

function utcDateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

async function readObject(object: string): Promise<Buffer | null> {
  try {
    const file = getAdminStorageBucket().file(object);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    return buf;
  } catch {
    return null;
  }
}

async function writeObject(
  object: string,
  data: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  try {
    await getAdminStorageBucket()
      .file(object)
      .save(Buffer.isBuffer(data) ? data : Buffer.from(data), {
        contentType,
        resumable: false,
        metadata: { cacheControl: "private, max-age=0" },
      });
  } catch {
    /* best-effort cache write — never breaks the caller */
  }
}

/** Layer 1: read the compact per-symbol snapshot for a date from GCS. */
export async function readDailySnapshot(dateKey: string): Promise<DailySnapshotMap | null> {
  const buf = await readObject(dailySnapshotObject(dateKey));
  if (!buf) return null;
  try {
    const parsed = JSON.parse(buf.toString("utf8")) as DailySnapshotMap;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeDailySnapshot(dateKey: string, map: DailySnapshotMap): Promise<void> {
  await writeObject(dailySnapshotObject(dateKey), Buffer.from(JSON.stringify(map)), "application/json");
}

/** Read a cached raw bhavcopy zip from GCS (layer 2 source). */
export async function readBhavcopyZip(dateKey: string): Promise<Uint8Array | null> {
  const buf = await readObject(bhavcopyZipObject(dateKey));
  return buf ? new Uint8Array(buf) : null;
}

export async function writeBhavcopyZip(dateKey: string, zip: Uint8Array): Promise<void> {
  await writeObject(bhavcopyZipObject(dateKey), zip, "application/zip");
}

/** Build the compact snapshot from raw zip bytes and cache it. */
function snapshotFromZip(dateKey: string, zip: Uint8Array): DailySnapshotMap {
  const csv = unzipBhavcopyCsv(zip, `bhavcopy ${dateKey}`);
  const rows = parseFoBhavcopyCsv(csv);
  return computeAllOiSnapshots(rows, dateKey);
}

export interface GetDailySnapshotOptions {
  /** Allow a live NSE download when nothing is cached (layer 3). Default false. */
  allowNse?: boolean;
  /** Reused NSE cookies for batched NSE fetches. */
  cookies?: string;
  /** NSE fetch attempts before throwing on persistent network failure (default 4). */
  fetchAttempts?: number;
}

/**
 * Resolve the compact per-symbol snapshot for a trading day via the layered
 * cache. Returns null for non-trading days / when uncached and `allowNse` is off.
 */
export async function getDailySnapshot(
  dateKey: string,
  opts: GetDailySnapshotOptions = {},
): Promise<DailySnapshotMap | null> {
  // Layer 1 — compact snapshot already cached.
  const cached = await readDailySnapshot(dateKey);
  if (cached) return cached;

  // Layer 2 — raw zip cached; derive + persist the snapshot.
  const cachedZip = await readBhavcopyZip(dateKey);
  if (cachedZip) {
    try {
      const map = snapshotFromZip(dateKey, cachedZip);
      await writeDailySnapshot(dateKey, map);
      return map;
    } catch {
      /* fall through to NSE if allowed */
    }
  }

  // Layer 3 — opt-in live fetch (rare backstop / one-time backfill).
  if (opts.allowNse) {
    const cookies = opts.cookies ?? (await getNseCookies().catch(() => ""));
    // NSE archive egress is flaky (intermittent "fetch failed"). Retry a few
    // times with backoff before giving up so a single hiccup doesn't drop a day.
    const attempts = Math.max(1, opts.fetchAttempts ?? 4);
    let zip: Uint8Array | null = null;
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        zip = await fetchFoBhavcopyZip(utcDateFromKey(dateKey), cookies);
        lastErr = null;
        break; // success (zip or a clean null=404)
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    if (lastErr) throw lastErr; // network failure persisted — let caller decide
    if (!zip) return null; // 404 → non-trading day
    await writeBhavcopyZip(dateKey, zip);
    try {
      const map = snapshotFromZip(dateKey, zip);
      await writeDailySnapshot(dateKey, map);
      return map;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Ensure the raw bhavcopy zip for a date is cached in GCS (cron's only NSE job).
 * Also materializes the compact snapshot. Returns true if the day is now cached.
 */
export async function ensureBhavcopyCached(
  dateKey: string,
  cookies?: string,
): Promise<{ cached: boolean; alreadyHad: boolean; symbols: number }> {
  const existing = await readDailySnapshot(dateKey);
  if (existing) return { cached: true, alreadyHad: true, symbols: Object.keys(existing).length };

  const map = await getDailySnapshot(dateKey, { allowNse: true, cookies });
  if (!map) return { cached: false, alreadyHad: false, symbols: 0 };
  return { cached: true, alreadyHad: false, symbols: Object.keys(map).length };
}
