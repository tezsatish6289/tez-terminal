const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDdMmYyyy(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

/** Format stored option-chain expiry labels for public zone disclaimers (DD/MM/YYYY). */
export function formatZonesExpiryLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  const dashed = s.split("-");
  if (dashed.length === 3) {
    const monthName = MONTH_MAP[dashed[1]];
    if (monthName !== undefined) {
      const day = parseInt(dashed[0], 10);
      const year = parseInt(dashed[2], 10);
      if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
      return toDdMmYyyy(day, monthName + 1, year);
    }
    const day = parseInt(dashed[0], 10);
    const month = parseInt(dashed[1], 10);
    const year = parseInt(dashed[2], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    return toDdMmYyyy(day, month, year);
  }

  const compact = /^(\d{1,2})([A-Z]{3})(\d{2})$/i.exec(s);
  if (compact) {
    const day = parseInt(compact[1], 10);
    const month = MONTH_MAP[compact[2].toUpperCase()];
    const year = 2000 + parseInt(compact[3], 10);
    if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) return null;
    return toDdMmYyyy(day, month + 1, year);
  }

  return null;
}
