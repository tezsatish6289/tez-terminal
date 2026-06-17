"use client";

import { useEffect, useMemo, useState } from "react";
import type { LevelsNews, NewsSentimentLabel } from "@/lib/levels/news-types";
import { cachedNews, fetchNews } from "./broadcast-data";

const SENTIMENT: Record<NewsSentimentLabel, { label: string; color: string; bg: string }> = {
  bullish: { label: "BULLISH", color: "#86efac", bg: "rgba(34,197,94,0.14)" },
  neutral: { label: "NEUTRAL", color: "#94a3b8", bg: "rgba(100,116,139,0.14)" },
  bearish: { label: "BEARISH", color: "#fca5a5", bg: "rgba(239,68,68,0.14)" },
};

const NEWS_CSS = `
@keyframes broadcast-news-in {
  0% { opacity: 0; transform: translate3d(0, 10px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
.broadcast-news-in { animation: broadcast-news-in 0.5s ease both; }
`;

/** How long each rolling headline stays on screen. */
const ITEM_MS = 6500;

/**
 * Rolling recent-news block for the single-stock page. Big-font headlines that
 * auto-advance, plus an AI sentiment badge. Reads from the shared cache (warmed
 * by the prefetcher) so it's instant on revisits. Informational, not advice.
 */
export function BroadcastNews({ scope, symbol }: { scope: "stock" | "index"; symbol: string }) {
  const [news, setNews] = useState<LevelsNews | null>(() => cachedNews(scope, symbol));
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setNews(cachedNews(scope, symbol));
    setIdx(0);
    void fetchNews(scope, symbol).then((n) => {
      if (!cancelled && n) setNews(n);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, symbol]);

  // Rolling items: concise highlights are ideal for big-font rotation. If a
  // symbol only has the long summary paragraph, split it into sentences so each
  // rolling item stays short instead of overflowing the box.
  const items = useMemo(() => {
    if (!news) return [];
    if (news.highlights.length > 0) return news.highlights;
    if (news.summary) {
      return news.summary
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return [];
  }, [news]);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % items.length), ITEM_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  const sentiment = news?.sentiment ? SENTIMENT[news.sentiment.label] : null;
  const current = items.length ? items[idx % items.length] : null;

  return (
    <div className="flex flex-col min-h-0 flex-1" style={{ marginTop: "1.8vh" }}>
      <style dangerouslySetInnerHTML={{ __html: NEWS_CSS }} />

      {/* Header row */}
      <div className="flex items-center justify-between shrink-0" style={{ marginBottom: "1.2vh" }}>
        <div className="flex items-center" style={{ gap: "0.9vh" }}>
          <span style={{ width: "0.5vh", height: "2vh", borderRadius: "999px", background: "#60a5fa" }} />
          <span
            className="font-black"
            style={{ fontSize: "1.55vh", color: "#e2e8f0", letterSpacing: "0.12em" }}
          >
            RECENT NEWS
          </span>
        </div>
        {sentiment && (
          <span
            className="font-black rounded-md"
            style={{
              fontSize: "1.4vh",
              letterSpacing: "0.06em",
              color: sentiment.color,
              background: sentiment.bg,
              border: `1px solid ${sentiment.color}55`,
              padding: "0.4vh 1vh",
            }}
          >
            {news?.sentiment?.score} · {sentiment.label}
          </span>
        )}
      </div>

      {/* Rolling headline in big font — clamped so it never bleeds into the
          header/footer no matter how long an item is. */}
      <div className="flex flex-col flex-1 min-h-0 justify-center overflow-hidden">
        {current ? (
          <p
            key={idx}
            className="broadcast-news-in"
            style={{
              fontSize: "2.3vh",
              lineHeight: 1.34,
              color: "#f0f4ff",
              fontWeight: 700,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 8,
              overflow: "hidden",
            }}
          >
            {current}
          </p>
        ) : (
          <p style={{ fontSize: "2vh", color: "#64748b" }}>Gathering latest news…</p>
        )}
      </div>

      {/* Progress dots + footer */}
      <div className="flex items-center justify-between shrink-0" style={{ marginTop: "1.4vh" }}>
        <div className="flex items-center" style={{ gap: "0.7vh" }}>
          {items.slice(0, 8).map((_, i) => (
            <span
              key={i}
              style={{
                width: i === idx % Math.max(items.length, 1) ? "2.6vh" : "1vh",
                height: "1vh",
                borderRadius: "999px",
                background: i === idx % Math.max(items.length, 1) ? "#60a5fa" : "rgba(96,165,250,0.25)",
                transition: "width 0.35s ease",
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: "1.25vh", color: "#475569", fontWeight: 600 }}>
          AI summary · not investment advice
        </span>
      </div>
    </div>
  );
}
