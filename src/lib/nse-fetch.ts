import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * Optional HTTPS proxy for all NSE India requests (same env vars most tools use).
 * Set to an Indian proxy if your host gets `{}` from NSE (geo / datacenter block).
 *
 * Examples: `https://user:pass@host:port` or `http://127.0.0.1:8888`
 */
const proxyUrl =
  typeof process !== "undefined"
    ? process.env.NSE_HTTPS_PROXY?.trim() || process.env.HTTPS_PROXY?.trim()
    : undefined;

const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

/** Use for every NSE HTTP call — respects `NSE_HTTPS_PROXY` / `HTTPS_PROXY` when set. */
export function nseFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  if (dispatcher) {
    return undiciFetch(url, {
      ...init,
      dispatcher,
    } as Parameters<typeof undiciFetch>[1]);
  }
  return fetch(url, init);
}
