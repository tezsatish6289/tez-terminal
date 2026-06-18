"use client";

import { useEffect, useMemo, useState } from "react";
import type { LevelsNews, NewsSentimentLabel } from "@/lib/levels/news-types";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";
import { useBroadcastNews } from "./useBroadcastNews";

const SENTIMENT: Record<NewsSentimentLabel, { label: string; color: string; bg: string }> = {
  bullish: { label: "BULLISH", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  neutral: { label: "NEUTRAL", color: "#94a3b8", bg: "rgba(100,116,139,0.14)" },
  bearish: { label: "BEARISH", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

const NEWS_CSS = `
@keyframes broadcast-news-in {
  0% { opacity: 0; transform: translate3d(0, 10px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
.broadcast-news-in { animation: broadcast-news-in 0.5s ease both; }
`;

const ITEM_MS = 5500;
const INK = "#f0f4ff";

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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
  if (out.length === 0 && news.sentiment.note.trim()) {
    out.push(news.sentiment.note.trim());
  }
  return out;
}

export function BroadcastNews({ scope, symbol }: { scope: "stock" | "index"; symbol: string }) {
  const { news, gaveUp } = useBroadcastNews(scope, symbol);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [scope, symbol, news?.generatedAt]);

  const items = useMemo(() => (news ? buildRollingItems(news) : []), [news]);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % items.length), ITEM_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  const sentiment = news?.sentiment ? SENTIMENT[news.sentiment.label] : null;
  const current = items.length ? items[idx % items.length] : null;

  return (
    <div className="flex flex-col min-h-0 flex-1" style={{ marginTop: "2vh" }}>
      <style dangerouslySetInnerHTML={{ __html: NEWS_CSS }} />

      <div className="flex items-center shrink-0" style={{ gap: "1vh", marginBottom: "1.3vh" }}>
        <span style={{ width: "0.45vh", height: "2.1vh", borderRadius: "999px", background: FNO_ACCENT }} />
        <span
          className="font-black"
          style={{ fontSize: "1.5vh", color: INK, letterSpacing: "0.14em" }}
        >
          RECENT NEWS
        </span>
        {sentiment && (
          <span
            className="font-black rounded-lg"
            style={{
              fontSize: "1.3vh",
              letterSpacing: "0.08em",
              color: sentiment.color,
              background: sentiment.bg,
              border: `1px solid ${sentiment.color}55`,
              padding: "0.35vh 1vh",
            }}
          >
            {sentiment.label}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 min-h-0 justify-center overflow-hidden">
        {current ? (
          <p
            key={idx}
            className="broadcast-news-in"
            style={{
              fontSize: "2.15vh",
              lineHeight: 1.38,
              color: INK,
              fontWeight: 600,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 8,
              overflow: "hidden",
            }}
          >
            {current}
          </p>
        ) : gaveUp ? (
          <p style={{ fontSize: "2vh", lineHeight: 1.34, color: INK, fontWeight: 600 }}>
            No fresh headlines for {symbol} right now — full news &amp; analytics on fnoninja.com.
          </p>
        ) : (
          <p style={{ fontSize: "1.9vh", color: "#64748b" }}>Gathering latest news…</p>
        )}
      </div>

      <div className="flex items-center justify-between shrink-0" style={{ marginTop: "1.5vh" }}>
        <div className="flex items-center" style={{ gap: "0.65vh" }}>
          {items.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === idx % items.length ? "2.8vh" : "0.8vh",
                height: "0.8vh",
                borderRadius: "999px",
                background: i === idx % items.length ? FNO_ACCENT : "rgba(96,165,250,0.22)",
                transition: "width 0.35s ease",
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: "1.2vh", color: "#475569", fontWeight: 600 }}>
          AI summary · not investment advice
        </span>
      </div>
    </div>
  );
}
