#!/usr/bin/env node
/**
 * Build real-data props for the daily videos from the running tez-terminal app,
 * reusing the SAME selection the website's bull/bear chart filter uses.
 *
 * One call to GET /api/freedombot/levels returns `inZone` — the RR-qualified
 * actionable setups (the exact list behind the Bullish/Bearish filter). Each
 * item carries its bull/bear bands, so we split it into:
 *   - bull side (spot IN/NEAR the put-cluster support band)  → put video
 *   - bear side (spot IN/NEAR the call-cluster resistance band) → call video
 * using the same status + nearest-band logic as src/lib/zones/zone-status.ts.
 *
 * Then we fetch per-symbol detail ONLY for those qualified names (a handful) to
 * read the dominant cluster OI (putClusterSize / callClusterSize) for ranking
 * and the on-screen callout, plus candles for the final picks.
 *
 * Writes out/put.json + out/call.json.
 *
 * Usage:
 *   BASE_URL=https://fnoninja.com node scripts/fetch-from-api.mjs
 *   # or BASE_URL=http://localhost:9002 against a local dev server
 */

import { writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "https://fnoninja.com";
const TOP_N = Number(process.env.TOP_N ?? 5);
const INTERVAL = process.env.INTERVAL ?? "15";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");

const MUSIC_TRACKS = readdirSync(AUDIO_DIR)
  .filter((f) => f.endsWith(".mp3"))
  .sort()
  .map((f) => `audio/${f}`);

/**
 * Pick two DISTINCT background tracks per run — one for the put video, one for
 * the call video — so the music actually rotates every time we generate (not
 * just once per day) and the two daily videos never share a track.
 */
function pickTwoTracks() {
  if (!MUSIC_TRACKS.length) return { put: null, call: null };
  const n = MUSIC_TRACKS.length;
  const putIdx = Math.floor(Math.random() * n);
  let callIdx = Math.floor(Math.random() * n);
  if (n > 1) while (callIdx === putIdx) callIdx = Math.floor(Math.random() * n);
  return { put: MUSIC_TRACKS[putIdx], call: MUSIC_TRACKS[callIdx] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function dateLabel() {
  return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** IST generation timestamp, e.g. "17 June 2026 at 04:00 PM". */
function generatedAtLabel() {
  const now = new Date();
  const date = now.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = now
    .toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
  return `${date} at ${time}`;
}

/** Closest band edge — mirrors zone-status.ts nearestBandKind. */
function nearestBandKind(d, spot) {
  const edges = [];
  if (d.bullLow != null) edges.push(["bull", d.bullLow]);
  if (d.bullHigh != null) edges.push(["bull", d.bullHigh]);
  if (d.bearLow != null) edges.push(["bear", d.bearLow]);
  if (d.bearHigh != null) edges.push(["bear", d.bearHigh]);
  if (!edges.length) return "bull";
  let best = edges[0];
  let bd = Math.abs(spot - best[1]);
  for (const e of edges) {
    const dd = Math.abs(spot - e[1]);
    if (dd < bd) {
      bd = dd;
      best = e;
    }
  }
  return best[0];
}

/** bull = at/near put-cluster support; bear = at/near call-cluster resistance. */
function sideOf(item) {
  const { status, data } = item;
  if (status === "IN_BULL") return "bull";
  if (status === "IN_BEAR") return "bear";
  if (status === "NEAR" && data?.spot != null) return nearestBandKind(data, data.spot);
  return null;
}

/** "IN" = spot inside the band; "NEAR" = approaching it. */
function zoneStateOf(item) {
  return item.status === "IN_BULL" || item.status === "IN_BEAR" ? "IN" : "NEAR";
}

function contextTag(d) {
  if (d.daysToEarnings != null && d.daysToEarnings >= 0 && d.daysToEarnings <= 3) {
    return `Earnings in ${d.daysToEarnings}d`;
  }
  if (d.volRegime === "ELEVATED") return "Elevated IV";
  if (d.volRegime === "EARNINGS") return "Earnings window";
  if (d.poc != null && d.spot != null && Math.abs(d.poc - d.spot) / d.spot < 0.005) return "Near max-pain";
  if (d.volRegime === "CALM") return "Calm IV";
  return null;
}

function toSlide(symbol, label, d, candles, zoneState) {
  return {
    symbol,
    label: label ?? symbol,
    spot: d.spot,
    zoneState,
    putClusterSize: d.putClusterSize ?? null,
    putClusterStrike: d.putClusterStrike ?? null,
    callClusterSize: d.callClusterSize ?? null,
    callClusterStrike: d.callClusterStrike ?? null,
    bullLow: d.bullLow ?? null,
    bullHigh: d.bullHigh ?? null,
    bearLow: d.bearLow ?? null,
    bearHigh: d.bearHigh ?? null,
    maxPain: d.poc ?? null,
    atmIV: d.atmIV ?? null,
    contextTag: contextTag(d),
    candles,
  };
}

async function main() {
  console.log(`[fetch] base=${BASE}`);
  const list = await getJson(`/api/freedombot/levels`);
  const inZone = (list.inZone ?? []).filter((x) => x.scope === "stock" && x.data);

  const bull = [];
  const bear = [];
  for (const it of inZone) {
    const s = sideOf(it);
    if (s === "bull") bull.push(it);
    else if (s === "bear") bear.push(it);
  }
  console.log(`[fetch] qualified setups: ${inZone.length} (bull=${bull.length}, bear=${bear.length})`);

  // Detail only for qualified names → cluster OI for ranking + callout.
  const symbols = [...new Set([...bull, ...bear].map((x) => x.symbol))];
  const detail = new Map();
  for (const sym of symbols) {
    try {
      const r = await getJson(`/api/freedombot/levels?symbol=${encodeURIComponent(sym)}`);
      if (r?.data?.spot != null) detail.set(sym, { symbol: sym, label: r.label, d: r.data });
    } catch (e) {
      console.warn(`  ! detail ${sym}: ${e.message}`);
    }
    await sleep(120);
  }

  // Rank IN-zone first, then fill the balance with NEAR-zone names; within each
  // group sort by dominant cluster OI (biggest wall first). Take up to TOP_N.
  const rank = (items, key) =>
    items
      .map((it) => ({ x: detail.get(it.symbol), zoneState: zoneStateOf(it) }))
      .filter((p) => p.x && (p.x.d[key] ?? 0) > 0)
      .sort((a, b) => {
        if (a.zoneState !== b.zoneState) return a.zoneState === "IN" ? -1 : 1;
        return (b.x.d[key] ?? 0) - (a.x.d[key] ?? 0);
      })
      .slice(0, TOP_N);

  const putPicks = rank(bull, "putClusterSize");
  const callPicks = rank(bear, "callClusterSize");

  const withCandles = async (picks) => {
    const out = [];
    for (const p of picks) {
      const sym = p.x.symbol ?? p.x.label;
      let candles = [];
      try {
        const c = await getJson(
          `/api/freedombot/levels/candles?symbol=${encodeURIComponent(sym)}&scope=stock&interval=${INTERVAL}`,
        );
        candles = (c.candles ?? []).slice(-120);
      } catch (e) {
        console.warn(`  ! candles ${sym}: ${e.message}`);
      }
      out.push(toSlide(sym, p.x.label, p.x.d, candles, p.zoneState));
      await sleep(120);
    }
    return out;
  };

  const label = dateLabel();
  const genLabel = generatedAtLabel();
  const music = pickTwoTracks();
  const put = {
    variant: "put",
    dateLabel: label,
    generatedAtLabel: genLabel,
    musicTrack: music.put,
    stocks: await withCandles(putPicks),
  };
  const call = {
    variant: "call",
    dateLabel: label,
    generatedAtLabel: genLabel,
    musicTrack: music.call,
    stocks: await withCandles(callPicks),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "put.json"), JSON.stringify(put, null, 2));
  writeFileSync(join(OUT_DIR, "call.json"), JSON.stringify(call, null, 2));
  console.log(`[fetch] wrote out/put.json (${put.stocks.length}) and out/call.json (${call.stocks.length})`);
  console.log(`[fetch] music: put → ${put.musicTrack}`);
  console.log(`[fetch] music: call → ${call.musicTrack}`);
  if (put.stocks.length < TOP_N || call.stocks.length < TOP_N) {
    console.log(`[fetch] note: fewer than ${TOP_N} qualified setups on one side today — that's expected on quiet days.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
