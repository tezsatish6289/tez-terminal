import { nseFetch } from "@/lib/nse-fetch";

/**
 * Shared NSE India session bootstrap.
 *
 * NSE's JSON APIs (`option-chain-v3`, `option-chain-contract-info`, etc.)
 * reject requests that don't carry a warmed-up cookie jar minted by
 * visiting the homepage + a couple of lightweight JSON endpoints first.
 * This module centralises that handshake so every NSE caller
 * (`nifty-options-zones`, `index-options-zones`, …) uses one battle-tested
 * flow instead of duplicating subtly-different copies.
 *
 * If your host gets `{}` from NSE (datacenter / geo block), set
 * `NSE_HTTPS_PROXY` to an Indian egress proxy — `nseFetch` honours it.
 */

export const NSE_HOME = "https://www.nseindia.com";
const NSE_MARKET_STATUS = "https://www.nseindia.com/api/marketStatus";
const NSE_ALL_INDICES = "https://www.nseindia.com/api/allIndices";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

export const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-IN,en;q=0.9",
  /** gzip/deflate only — rare broken br decode on serverless breaks JSON parsing. */
  "Accept-Encoding": "gzip, deflate",
  Referer: "https://www.nseindia.com/option-chain",
  "X-Requested-With": "XMLHttpRequest",
  Connection: "keep-alive",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

/**
 * Extract Set-Cookie fragments. IMPORTANT: one comma-separated "set-cookie" header is unsafe
 * (Expires=Wed, 21 May 2025 contains commas). Prefer Headers#getSetCookie when available (Node/undici).
 */
function cookiesFromResponse(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    try {
      return h
        .getSetCookie()
        .map((line) => line.split(";")[0]?.trim())
        .filter(Boolean) as string[];
    } catch {
      /* fall through */
    }
  }
  const raw = res.headers.get("set-cookie") ?? "";
  if (!raw) return [];
  return raw.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
}

/** Merge cookie fragments from multiple responses (latest wins per cookie name). */
function mergeCookieJar(fragments: string[][]): string {
  const map = new Map<string, string>();
  for (const group of fragments) {
    for (const c of group) {
      const name = c.split("=")[0]?.trim();
      if (name) map.set(name, c);
    }
  }
  return [...map.values()].join("; ");
}

/** Bootstrap an NSE cookie jar through the same hops a real browser tab makes. */
export async function getNseCookies(): Promise<string> {
  const batches: string[][] = [];
  const pushCookies = (res: Response) => {
    batches.push(cookiesFromResponse(res));
  };

  // 1) Homepage — initial nsit / bm_sv / etc.
  pushCookies(
    await nseFetch(NSE_HOME, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    }),
  );

  await sleep(250);
  let jar = mergeCookieJar(batches);

  // 2) Session JSON — establishes tokens many scrapers rely on before option-chain API
  try {
    pushCookies(
      await nseFetch(NSE_MARKET_STATUS, {
        headers: { ...API_HEADERS, Cookie: jar, Referer: `${NSE_HOME}/` },
        signal: AbortSignal.timeout(12_000),
      }),
    );
  } catch {
    /* non-fatal */
  }

  await sleep(250);
  jar = mergeCookieJar(batches);

  // 3) Option-chain HTML page (same tab flow as a real user)
  pushCookies(
    await nseFetch("https://www.nseindia.com/option-chain", {
      headers: { ...BROWSER_HEADERS, Cookie: jar, Referer: NSE_HOME },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    }),
  );

  await sleep(250);
  jar = mergeCookieJar(batches);

  // 4) Another JSON hop — keeps cookie jar warm for same-origin XHR-style calls
  try {
    pushCookies(
      await nseFetch(NSE_ALL_INDICES, {
        headers: { ...API_HEADERS, Cookie: jar, Referer: "https://www.nseindia.com/option-chain" },
        signal: AbortSignal.timeout(12_000),
      }),
    );
  } catch {
    /* non-fatal */
  }

  return mergeCookieJar(batches);
}
