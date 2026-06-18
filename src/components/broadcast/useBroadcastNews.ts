"use client";

import { useEffect, useState } from "react";
import type { LevelsNews } from "@/lib/levels/news-types";
import { cachedNews, fetchNews } from "./broadcast-data";

/**
 * Shared news loader for the broadcast stock rail. Deduped via broadcast-data
 * inflight cache so BroadcastSlide (company name) and BroadcastNews (body)
 * never double-fetch.
 */
export function useBroadcastNews(scope: "stock" | "index", symbol: string) {
  const [news, setNews] = useState<LevelsNews | null>(() => cachedNews(scope, symbol));
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    setNews(cachedNews(scope, symbol));
    setGaveUp(false);

    const tryLoad = () => {
      void fetchNews(scope, symbol).then((n) => {
        if (cancelled) return;
        if (n) {
          setNews(n);
          return;
        }
        attempts += 1;
        if (attempts < 5) timer = window.setTimeout(tryLoad, 6000);
        else setGaveUp(true);
      });
    };
    tryLoad();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scope, symbol]);

  return { news, gaveUp };
}
