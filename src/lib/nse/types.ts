/**
 * Shared NSE client — response classification + typed errors.
 *
 * This module is intentionally self-contained and ADDITIVE: nothing in the
 * existing crypto / zone-bot path imports it, so it cannot affect those flows.
 * It exists so the upcoming equity (stock) zone work can hit NSE with a single
 * rate-limited, circuit-broken, session-reusing client.
 */

/** Outcome classification for a raw NSE HTTP response. */
export type NseResponseKind =
  | "ok"          // valid, non-empty JSON
  | "empty"       // body was `{}` / "" — session rejected or geo-blocked
  | "non_json"    // HTML / WAF page instead of JSON — bot-blocked
  | "http_error"; // non-2xx status

/** A block signature was detected — callers should stop hitting NSE and back off. */
export class NseBlockError extends Error {
  readonly kind: NseResponseKind;
  readonly status: number | null;

  constructor(kind: NseResponseKind, message: string, status: number | null = null) {
    super(message);
    this.name = "NseBlockError";
    this.kind = kind;
    this.status = status;
  }
}

/** The shared circuit breaker is open — NSE is paused globally. */
export class NseCircuitOpenError extends Error {
  readonly blockedUntil: string;

  constructor(blockedUntil: string) {
    super(`NSE circuit breaker open until ${blockedUntil}`);
    this.name = "NseCircuitOpenError";
    this.blockedUntil = blockedUntil;
  }
}

/**
 * Classify an NSE response body. NSE returns HTTP 200 with `{}` (or HTML) when
 * it rejects a session or blocks a datacenter IP, so status alone is not enough.
 */
export function classifyNseBody(status: number, body: string): NseResponseKind {
  if (status < 200 || status >= 300) return "http_error";
  const trimmed = body.trim();
  if (trimmed === "" || trimmed === "{}") return "empty";
  // NSE JSON endpoints always return an object/array; a leading "<" means HTML.
  if (trimmed.startsWith("<")) return "non_json";
  try {
    JSON.parse(trimmed);
    return "ok";
  } catch {
    return "non_json";
  }
}

/** True for any kind that indicates NSE is rejecting/blocking us. */
export function isBlockKind(kind: NseResponseKind): boolean {
  return kind === "empty" || kind === "non_json" || kind === "http_error";
}
