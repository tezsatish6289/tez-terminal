/** Normalise to a valid 10-digit Indian mobile (6-9 leading), else null. */
export function normalizeIndianMobile(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

/** E.164 form for Firebase Phone Auth, e.g. `9876543210` → `+919876543210`. */
export function toE164Indian(normalized10: string): string {
  return `+91${normalized10}`;
}

/** Masks a mobile for display, e.g. "9876543210" → "98••••3210". */
export function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 6) return phone;
  return `${phone.slice(0, 2)}••••${phone.slice(-4)}`;
}
