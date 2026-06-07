import assert from "node:assert/strict";
import {
  parseBoardMeetingDate,
  parseEarningsFromBoardMeetings,
  purposeIsResults,
} from "../../src/lib/nse-earnings-calendar";

// ── purposeIsResults ──────────────────────────────────────────────────────
{
  assert.equal(purposeIsResults("Financial Results"), true);
  assert.equal(purposeIsResults("To consider audited results for Q1"), true);
  assert.equal(purposeIsResults("Quarterly Results"), true);
  // Real NSE bm_desc phrasing.
  assert.equal(
    purposeIsResults(
      "X has informed the Exchange about Board Meeting to be held on 27-Jul-2026 to consider and approve the Yearly Audited Financial results of the Company.",
    ),
    true,
  );
  assert.equal(purposeIsResults("Dividend"), false);
  assert.equal(purposeIsResults("Fund Raising"), false);
  // Generic intimation (the bm_purpose value) must NOT match on its own.
  assert.equal(purposeIsResults("Board Meeting Intimation"), false);
  // Unrelated "results" must not false-positive.
  assert.equal(purposeIsResults("to consider the results of the postal ballot"), false);
  assert.equal(purposeIsResults(null), false);
}

// ── parseBoardMeetingDate ─────────────────────────────────────────────────
{
  assert.equal(parseBoardMeetingDate("15-Jul-2026"), new Date(Date.UTC(2026, 6, 15)).toISOString());
  assert.equal(parseBoardMeetingDate("2026-07-15"), new Date("2026-07-15").toISOString());
  assert.equal(parseBoardMeetingDate("garbage"), null);
  assert.equal(parseBoardMeetingDate(null), null);
}

// ── parseEarningsFromBoardMeetings ────────────────────────────────────────
{
  const now = Date.parse("2026-06-07T00:00:00Z");
  const rows = [
    { symbol: "RELIANCE", purpose: "Financial Results", bm_date: "20-Jul-2026" },
    // earlier results meeting for same symbol → should win
    { symbol: "RELIANCE", purpose: "Quarterly Results", bm_date: "10-Jul-2026" },
    // non-results purpose → ignored
    { symbol: "TCS", purpose: "Dividend", bm_date: "12-Jul-2026" },
    // results, but in the past → dropped
    { symbol: "INFY", purpose: "Audited Financial Results", bm_date: "01-Jun-2026" },
    // real NSE shape: generic bm_purpose, results agenda only in bm_desc
    {
      bm_symbol: "HDFCBANK",
      bm_purpose: "Board Meeting Intimation",
      bm_desc: "HDFC Bank to consider and approve the Audited Financial Results for the period ended March 2026 and Dividend.",
      bm_date: "18-Jul-2026",
    },
    // symbol normalization (lowercase + noise)
    { symbol: "wipro ", purpose: "Quarterly Results", bm_date: "22-Jul-2026" },
  ];
  const cal = parseEarningsFromBoardMeetings(rows, now);

  assert.equal(cal.RELIANCE, new Date(Date.UTC(2026, 6, 10)).toISOString());
  assert.equal(cal.TCS, undefined); // dividend ignored
  assert.equal(cal.INFY, undefined); // past dropped
  assert.equal(cal.HDFCBANK, new Date(Date.UTC(2026, 6, 18)).toISOString());
  assert.equal(cal.WIPRO, new Date(Date.UTC(2026, 6, 22)).toISOString());
}

console.log("nse-earnings-calendar.test.ts ok");
