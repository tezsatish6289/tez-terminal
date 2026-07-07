import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * Optional HTTPS proxy for all NSE India requests (same env vars most tools use).
 * Set to an Indian proxy if your host gets `{}` from NSE (geo / datacenter block).
 *
 * Examples: `https://user:pass@host:port` or `http://127.0.0.1:8888`
 *
 * Self-healing: the proxy dispatcher is built lazily and rebuilt whenever the
 * env value changes OR a request fails at the connection level ("fetch failed").
 * A long-lived instance whose proxy briefly died (e.g. balance ran out) therefore
 * recovers on the next call WITHOUT needing a redeploy — the old singleton
 * pattern stayed poisoned until the process restarted.
 */

function readProxyUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env.NSE_HTTPS_PROXY?.trim() || process.env.HTTPS_PROXY?.trim() || undefined;
}

let dispatcher: ProxyAgent | undefined;
let dispatcherUrl: string | undefined;
let dispatcherReady = false;

function closeDispatcher(): void {
  const old = dispatcher;
  dispatcher = undefined;
  dispatcherUrl = undefined;
  dispatcherReady = false;
  if (old) void old.close().catch(() => {});
}

/** Current proxy dispatcher, (re)built if the env changed or it was reset. */
function getDispatcher(): ProxyAgent | undefined {
  const url = readProxyUrl();
  if (!url) {
    if (dispatcher) closeDispatcher();
    dispatcherReady = true;
    return undefined;
  }
  if (!dispatcherReady || !dispatcher || url !== dispatcherUrl) {
    if (dispatcher) closeDispatcher();
    dispatcher = new ProxyAgent(url);
    dispatcherUrl = url;
    dispatcherReady = true;
  }
  return dispatcher;
}

/** Drop the current proxy agent so the next call builds a fresh one. */
export function resetNseProxy(): void {
  closeDispatcher();
}

/** Use for every NSE HTTP call — respects `NSE_HTTPS_PROXY` / `HTTPS_PROXY` when set. */
export async function nseFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const agent = getDispatcher();
  if (!agent) return fetch(url, init);

  try {
    return (await undiciFetch(url, {
      ...init,
      dispatcher: agent,
    } as Parameters<typeof undiciFetch>[1])) as unknown as Response;
  } catch (err) {
    // Connection-level failure (proxy blip / poisoned pool). Rebuild the agent
    // and retry once so a transient proxy outage self-heals in-process. HTTP
    // errors (4xx/5xx) come back as a Response and never reach here.
    closeDispatcher();
    const retryAgent = getDispatcher();
    if (!retryAgent) throw err;
    return (await undiciFetch(url, {
      ...init,
      dispatcher: retryAgent,
    } as Parameters<typeof undiciFetch>[1])) as unknown as Response;
  }
}
