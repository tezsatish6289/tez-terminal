/**
 * Social platform registry for Buffer publishing.
 *
 * `postBudget` is the SOFT cap we keep captions WELL under the hard platform
 * limit — Buffer rejects over-limit posts server-side (InvalidInputError), and
 * trimmed posts read better and are less likely to be truncated by the network.
 * We aim ~55–65% of the real limit on purpose (see clampCaption).
 */

export type SocialPlatformId = "twitter" | "facebook" | "linkedin" | "instagram" | "youtube";

export interface SocialPlatform {
  id: SocialPlatformId;
  label: string;
  /** Real platform hard limit (for reference / UI counters). */
  hardLimit: number;
  /** Our self-imposed budget — captions are clamped to this before posting. */
  postBudget: number;
  /** Buffer `service` slugs that map to this platform (X reports as "twitter"). */
  bufferServices: string[];
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { id: "twitter", label: "X / Twitter", hardLimit: 280, postBudget: 230, bufferServices: ["twitter", "x"] },
  { id: "facebook", label: "Facebook", hardLimit: 2000, postBudget: 400, bufferServices: ["facebook"] },
  { id: "linkedin", label: "LinkedIn", hardLimit: 3000, postBudget: 1100, bufferServices: ["linkedin"] },
  { id: "instagram", label: "Instagram", hardLimit: 2200, postBudget: 1500, bufferServices: ["instagram"] },
  { id: "youtube", label: "YouTube (Shorts)", hardLimit: 5000, postBudget: 900, bufferServices: ["youtube"] },
];

export function getPlatform(id: SocialPlatformId): SocialPlatform | undefined {
  return SOCIAL_PLATFORMS.find((p) => p.id === id);
}

/** Map a Buffer channel `service` slug to our platform id (or null if unmapped). */
export function platformForBufferService(service: string): SocialPlatformId | null {
  const slug = service.trim().toLowerCase();
  return SOCIAL_PLATFORMS.find((p) => p.bufferServices.includes(slug))?.id ?? null;
}

/**
 * Clean a caption for networks that DON'T render markdown (all of ours: X, FB,
 * LinkedIn, IG, YouTube). Strips **bold** / __bold__ markers, repairs a price
 * that got pushed onto its own line ("… at\n₹1780" → "… at ₹1780"), and tidies
 * whitespace. Safe to run more than once.
 */
export function normalizeCaption(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/[ \t]*\n[ \t]*(₹)/g, " $1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Trim a caption to `budget` characters without cutting a trailing link/hashtag
 * block. We keep the opening hook + any trailing lines that contain a URL or
 * start with '#', and drop body lines from the bottom until it fits. Falls back
 * to a hard word-boundary cut if a single block is still too long.
 */
export function clampCaption(text: string, budget: number): string {
  const clean = text.replace(/\r\n/g, "\n").trimEnd();
  if (clean.length <= budget) return clean;

  const lines = clean.split("\n");
  const isTrailer = (l: string) => /https?:\/\//i.test(l) || l.trim().startsWith("#");

  // Split into [head ...body, ...trailer] — trailer = contiguous trailing link/hashtag lines.
  let trailerStart = lines.length;
  while (trailerStart > 1 && (isTrailer(lines[trailerStart - 1]) || lines[trailerStart - 1].trim() === "")) {
    trailerStart--;
  }
  const head = lines.slice(0, Math.max(1, trailerStart));
  const trailer = lines.slice(Math.max(1, trailerStart));

  const join = (h: string[], t: string[]) => [...h, ...t].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();

  // Drop body lines (from the bottom of head, keeping the first hook line) until it fits.
  const kept = [...head];
  while (kept.length > 1 && join(kept, trailer).length > budget) {
    kept.splice(kept.length - 1, 1);
  }

  let out = join(kept, trailer);
  if (out.length <= budget) return out;

  // Still too long (huge single line) — hard cut at a word boundary, keep trailer if it fits.
  const trailerText = trailer.length ? "\n" + trailer.join("\n").trim() : "";
  const room = Math.max(0, budget - trailerText.length - 1);
  const headText = kept[0] ?? "";
  let cut = headText.slice(0, room);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > room * 0.6) cut = cut.slice(0, lastSpace);
  out = `${cut.trimEnd()}…${trailerText}`;
  return out.slice(0, budget);
}
