import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { INDIA_VIX_DOC } from "@/lib/india-vix";
import {
  TICKER_ORDER,
  type MarketTickerItem,
  type TickerLabel,
} from "@/lib/fnoninja/market-ticker-types";
import { API_HEADERS, getNseCookies } from "@/lib/nse-session";
import { nseFetch } from "@/lib/nse-fetch";

const NSE_ALL_INDICES = "https://www.nseindia.com/api/allIndices";

interface AllIndicesRow {
  index?: string;
  indexSymbol?: string;
  last?: number | string;
  percentChange?: number | string;
  variation?: number | string;
  previousClose?: number | string;
}

interface AllIndicesResponse {
  data?: AllIndicesRow[];
}

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowText(row: AllIndicesRow): string {
  return `${row.index ?? ""} ${row.indexSymbol ?? ""}`.toUpperCase();
}

function matchesTicker(label: TickerLabel, row: AllIndicesRow): boolean {
  const text = rowText(row);
  const sym = (row.indexSymbol ?? "").toUpperCase();
  switch (label) {
    case "FINNIFTY":
      return sym === "NIFTY FIN SERVICE" || text.includes("FIN SERVICE") || sym === "FINNIFTY";
    case "INDIA VIX":
      return text.includes("INDIA VIX");
    case "MIDCPNIFTY":
      return sym === "NIFTY MIDCAP SELECT" || text.includes("MIDCAP SELECT") || sym === "MIDCPNIFTY";
    case "SENSEX":
      return text.includes("SENSEX");
    case "NIFTY":
      return sym === "NIFTY 50" || row.index === "NIFTY 50";
    case "BANKNIFTY":
      return sym === "NIFTY BANK" || row.index === "NIFTY BANK";
    default:
      return false;
  }
}

function pctFromRow(row: AllIndicesRow): number | null {
  const direct = num(row.percentChange);
  if (direct != null) return direct;
  const last = num(row.last);
  const prev = num(row.previousClose);
  if (last != null && prev != null && prev !== 0) {
    return ((last - prev) / prev) * 100;
  }
  return null;
}

function itemFromRow(label: TickerLabel, row: AllIndicesRow): MarketTickerItem {
  return {
    label,
    price: num(row.last),
    changePct: pctFromRow(row),
  };
}

async function readFirestoreFallback(): Promise<Partial<Record<TickerLabel, MarketTickerItem>>> {
  const db = getAdminFirestore();
  const indexKeyMap: Record<Exclude<TickerLabel, "INDIA VIX" | "SENSEX">, string> = {
    FINNIFTY: "FINNIFTY",
    MIDCPNIFTY: "MIDCPNIFTY",
    NIFTY: "NIFTY",
    BANKNIFTY: "BANKNIFTY",
  };

  const indexKeys = Object.values(indexKeyMap);

  const [vixSnap, ...indexSnaps] = await Promise.all([
    db.doc(INDIA_VIX_DOC).get(),
    ...indexKeys.map((k) => db.doc(`config/suggested_index_zones_${k}`).get()),
  ]);

  const out: Partial<Record<TickerLabel, MarketTickerItem>> = {};

  const vixData = vixSnap.data();
  const vixValue = num(vixData?.value);
  if (vixValue != null) {
    const history = Array.isArray(vixData?.history) ? vixData.history : [];
    const prev = history.length >= 2 ? num(history[history.length - 2]?.value) : null;
    out["INDIA VIX"] = {
      label: "INDIA VIX",
      price: vixValue,
      changePct:
        prev != null && prev !== 0 ? ((vixValue - prev) / prev) * 100 : null,
    };
  }

  indexKeys.forEach((key, i) => {
    const label = (Object.entries(indexKeyMap).find(([, v]) => v === key)?.[0] ??
      key) as TickerLabel;
    const spot =
      num(indexSnaps[i]?.data()?.deribitIndexPrice) ?? num(indexSnaps[i]?.data()?.btcPrice);
    if (spot != null) {
      out[label] = { label, price: spot, changePct: null };
    }
  });

  return out;
}

async function fetchNseIndices(): Promise<AllIndicesRow[]> {
  const cookies = await getNseCookies();
  const res = await nseFetch(NSE_ALL_INDICES, {
    headers: {
      ...API_HEADERS,
      Cookie: cookies,
      Referer: "https://www.nseindia.com/option-chain",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as AllIndicesResponse;
  return json.data ?? [];
}

/** Build ordered ticker items for the FNONINJA landing strip. */
export async function getMarketTickerItems(): Promise<MarketTickerItem[]> {
  const fallback = await readFirestoreFallback();
  let rows: AllIndicesRow[] = [];

  try {
    rows = await fetchNseIndices();
  } catch {
    /* use fallback only */
  }

  return TICKER_ORDER.map((label) => {
    const row = rows.find((r) => matchesTicker(label, r));
    if (row) {
      const fromNse = itemFromRow(label, row);
      if (fromNse.price != null) return fromNse;
    }
    return (
      fallback[label] ?? {
        label,
        price: null,
        changePct: null,
      }
    );
  });
}
