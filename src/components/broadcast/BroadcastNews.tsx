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
const ITEM_MS = 5500;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Summary sentences first (chart-page lead copy), then bullet highlights. */
function buildRollingItems(news: LevelsNews): string[] {
  const summaryParts = news.summary ? splitSentences(news.summary) : [];
  const seen = new Set(summaryParts.map((s) => s.toLowerCase()));
  const out = [...summaryParts];
  for (const h of news.highlights) {
    const key = h.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h.trim());
  }
  return out;
}

/**
 * Rolling recent-news block for the single-stock page. Big-font headlines that
 * auto-advance, plus an AI sentiment badge. Reads from the shared cache (warmed
 * by the prefetcher) so it's instant on revisits. Informational, not advice.
 */
export function BroadcastNews({ scope, symbol }: { scope: "stock" | "index"; symbol: string }) {
  const [news, setNews] = useState<LevelsNews | null>(() => cachedNews(scope, symbol));
  const [idx, setIdx] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    setNews(cachedNews(scope, symbol));
    setIdx(0);
    setGaveUp(false);

    // fetchNews retries internally; keep re-asking while this symbol is on
    // screen so a slow cold generation that finishes later still shows up.
    const tryLoad = () => {
      void fetchNews(scope, symbol).then((n) => {
        if (cancelled) return;
        if (n) {
          setNews(n);
          return;
        }
        attempts += 1;
        if (attempts < 3) timer = window.setTimeout(tryLoad, 8000);
        else setGaveUp(true);
      });
    };
    tryLoad();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scope, symbol]);

  // Roll summary sentences first, then highlights — same content as the chart
  // page, split so each item fits the broadcast rail.
  const items = useMemo(() => (news ? buildRollingItems(news) : []), [news]);

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

      {/* Header row — label + sentiment tag sit together for instant read. */}
      <div className="flex items-center shrink-0" style={{ gap: "1.1vh", marginBottom: "1.2vh" }}>
        <span style={{ width: "0.5vh", height: "2vh", borderRadius: "999px", background: "#60a5fa" }} />
        <span
          className="font-black"
          style={{ fontSize: "1.55vh", color: "#e2e8f0", letterSpacing: "0.12em" }}
        >
          RECENT NEWS
        </span>
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
            {sentiment.label}
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
        ) : gaveUp ? (
          <p style={{ fontSize: "2.1vh", lineHeight: 1.34, color: "#94a3b8", fontWeight: 600 }}>
            No fresh headlines for {symbol} right now — full news &amp; analytics on{" "}
            <span style={{ color: "#60a5fa", fontWeight: 800 }}>fnoninja.com</span>.
          </p>
        ) : (
          <p style={{ fontSize: "2vh", color: "#64748b" }}>Gathering latest news…</p>
        )}
      </div>

      {/* Progress dots + footer */}
      <div className="flex items-center justify-between shrink-0" style={{ marginTop: "1.4vh" }}>
        <div className="flex items-center" style={{ gap: "0.7vh" }}>
          {items.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === idx % items.length ? "2.6vh" : "0.85vh",
                height: "0.85vh",
                borderRadius: "999px",
                background: i === idx % items.length ? "#60a5fa" : "rgba(96,165,250,0.25)",
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
