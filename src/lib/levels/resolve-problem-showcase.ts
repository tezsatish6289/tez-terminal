import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { fetchSymbolLevels } from "@/lib/levels/fetch-symbol-levels";
import {
  levelsSupportShowcase,
  NIFTY_SHOWCASE_FALLBACK,
  pickWidestSpreadStock,
  type ShowcaseSymbol,
  type StockSpreadSource,
} from "@/lib/levels/pick-widest-cluster-symbol";

export type ProblemShowcaseResult = {
  target: ShowcaseSymbol;
  levels: PublicLevels | null;
};

interface LevelsPayload {
  stocks: StockSpreadSource[];
}

async function resolveProblemShowcase(): Promise<ProblemShowcaseResult> {
  const res = await fetch("/api/freedombot/levels", { cache: "no-store" });
  const json = (await res.json()) as LevelsPayload;
  const picked = pickWidestSpreadStock(json.stocks ?? []);

  if (picked) {
    const full = await fetchSymbolLevels("stock", picked.symbol);
    if (levelsSupportShowcase(full.data)) {
      return { target: picked, levels: full.data };
    }
  }

  const nifty = await fetchSymbolLevels("index", NIFTY_SHOWCASE_FALLBACK.symbol);
  return {
    target: NIFTY_SHOWCASE_FALLBACK,
    levels: nifty.data,
  };
}

let prefetchPromise: Promise<ProblemShowcaseResult> | null = null;

/** Start loading second-fold showcase data (reuses existing levels APIs). */
export function prefetchProblemShowcase(): Promise<ProblemShowcaseResult> {
  if (!prefetchPromise) {
    prefetchPromise = resolveProblemShowcase().catch((err) => {
      prefetchPromise = null;
      throw err;
    });
  }
  return prefetchPromise;
}

/** Read showcase data — uses prefetch cache when available. */
export function loadProblemShowcase(): Promise<ProblemShowcaseResult> {
  return prefetchProblemShowcase();
}
