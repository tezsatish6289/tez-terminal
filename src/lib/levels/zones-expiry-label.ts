import { istCalendarDateKey } from "@/lib/ist-display";

const MONTH_NUM: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDdMmYyyy(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const fullYear = year < 100 ? (year >= 70 ? 1900 + year : 2000 + year) : year;
  if (fullYear < 2000 || fullYear > 2100) return null;
  return `${pad2(day)}/${pad2(month)}/${fullYear}`;
}

function monthFromToken(token: string): number | null {
  const key = token.trim().slice(0, 3).toUpperCase();
  return MONTH_NUM[key] ?? null;
}

/** Format stored option-chain expiry labels for public zone disclaimers (DD/MM/YYYY). */
export function formatZonesExpiryLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s === "synthetic (spot-only)") return null;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(s);
  if (iso) {
    return toDdMmYyyy(parseInt(iso[3], 10), parseInt(iso[2], 10), parseInt(iso[1], 10));
  }

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (slashed) {
    const day = parseInt(slashed[1], 10);
    const month = parseInt(slashed[2], 10);
    const year = parseInt(slashed[3], 10);
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      return toDdMmYyyy(day, month, year);
    }
  }

  const dashed = s.split("-");
  if (dashed.length === 3) {
    const month = monthFromToken(dashed[1]);
    if (month != null) {
      const day = parseInt(dashed[0], 10);
      const year = parseInt(dashed[2], 10);
      if (Number.isFinite(day) && Number.isFinite(year)) {
        return toDdMmYyyy(day, month, year);
      }
    }
    const day = parseInt(dashed[0], 10);
    const monthNum = parseInt(dashed[1], 10);
    const year = parseInt(dashed[2], 10);
    if (Number.isFinite(day) && Number.isFinite(monthNum) && Number.isFinite(year)) {
      return toDdMmYyyy(day, monthNum, year);
    }
  }

  const compact = /^(\d{1,2})([A-Za-z]{3})(\d{2,4})$/i.exec(s.replace(/\s+/g, ""));
  if (compact) {
    const day = parseInt(compact[1], 10);
    const month = monthFromToken(compact[2]);
    const year = parseInt(compact[3], 10);
    if (month != null && Number.isFinite(day) && Number.isFinite(year)) {
      return toDdMmYyyy(day, month, year);
    }
  }

  const spaced = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/i.exec(s);
  if (spaced) {
    const day = parseInt(spaced[1], 10);
    const month = monthFromToken(spaced[2]);
    const year = parseInt(spaced[3], 10);
    if (month != null && Number.isFinite(day) && Number.isFinite(year)) {
      return toDdMmYyyy(day, month, year);
    }
  }

  return null;
}

/** NSE expiry label → `YYYY-MM-DD` calendar date in IST. */
export function nseExpiryIstDateKey(label: string): string | null {
  const formatted = formatZonesExpiryLabel(label);
  if (!formatted) return null;
  const [day, month, year] = formatted.split("/");
  if (!day || !month || !year) return null;
  return `${year}-${month}-${day}`;
}

/** True when the expiry's IST calendar date is before today. */
export function isNseExpiryExpired(label: string, nowMs = Date.now()): boolean {
  const expKey = nseExpiryIstDateKey(label);
  if (!expKey) return false;
  return expKey < istCalendarDateKey(nowMs);
}

/** Resolve expiry from a stored zones doc (top-level or maxPainByExpiry fallback). */
export function resolveZonesExpiryFromStored(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;

  const candidates: unknown[] = [raw.expiryUsed, raw.expiry, raw.zonesExpiry];
  const byExpiry = raw.maxPainByExpiry;
  if (Array.isArray(byExpiry)) {
    for (const entry of byExpiry) {
      if (entry && typeof entry === "object" && "expiry" in entry) {
        candidates.push((entry as { expiry: unknown }).expiry);
      }
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && isNseExpiryExpired(candidate)) continue;
    const formatted = formatZonesExpiryLabel(candidate);
    if (formatted) return formatted;
  }

  return null;
}
