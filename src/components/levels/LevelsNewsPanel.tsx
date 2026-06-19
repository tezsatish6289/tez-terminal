"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Newspaper, RefreshCw } from "lucide-react";
import {
  LEVELS_NEWS_WINDOW_DAYS,
  type LevelsNews,
  type NewsSentiment,
  type NewsSentimentLabel,
} from "@/lib/levels/news-types";

const SENTIMENT_DISPLAY: Record<
  NewsSentimentLabel,
  { label: string; bg: string; border: string; text: string }
> = {
  bullish: {
    label: "Bullish",
    bg: "rgba(34,197,94,0.14)",
    border: "rgba(134,239,172,0.45)",
    text: "#86efac",
  },
  neutral: {
    label: "Neutral",
    bg: "rgba(100,116,139,0.12)",
    border: "rgba(148,163,184,0.35)",
    text: "#94a3b8",
  },
  bearish: {
    label: "Bearish",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(252,165,165,0.45)",
    text: "#fca5a5",
  },
};

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function NewsSentimentBadge({ sentiment }: { sentiment: NewsSentiment }) {
  const style = SENTIMENT_DISPLAY[sentiment.label];
  return (
    <span
      className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider tabular-nums whitespace-nowrap"
      style={{
        color: style.text,
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
      }}
      title={sentiment.note || undefined}
    >
      {sentiment.score} · {style.label}
    </span>
  );
}

/**
 * Right-rail recent news for a levels symbol (stock or index).
 * AI-grounded 4-week summary + sentiment + citations from /api/freedombot/levels/news.
 */
export function LevelsNewsPanel({
  scope,
  symbol,
  className = "",
}: {
  scope: "stock" | "index";
  symbol: string;
  className?: string;
}) {
  const [news, setNews] = useState<LevelsNews | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/freedombot/levels/news?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(symbol)}&window=${LEVELS_NEWS_WINDOW_DAYS}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { ok: boolean; news?: LevelsNews; error?: string };
      if (!json.ok || !json.news) {
        setError(json.error ?? "No news available");
        setNews(null);
      } else {
        setNews(json.news);
      }
    } catch {
      setError("Could not load news");
      setNews(null);
    } finally {
      setLoading(false);
    }
  }, [scope, symbol]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className={`flex flex-col min-h-0 h-full max-md:h-auto max-md:overflow-visible rounded-xl overflow-hidden ${className}`.trim()}
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        backgroundColor: "rgba(0,0,0,0.35)",
      }}
    >
      <div
        className="shrink-0 flex items-center justify-between gap-3 pl-3 pr-3.5 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Newspaper className="h-4 w-4 shrink-0" style={{ color: "#60a5fa" }} />
          <div className="min-w-0">
            <span
              className="text-[13px] font-black uppercase tracking-[0.12em] truncate block"
              style={{ color: "#e2e8f0" }}
            >
              Recent News
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#475569" }}>
              4 weeks
            </span>
          </div>
        </div>
        {news ? (
          <NewsSentimentBadge
            sentiment={
              news.sentiment ?? {
                label: "neutral",
                score: 50,
                note: news.stale
                  ? "Cached summary — refresh for sentiment score."
                  : "Sentiment not available.",
              }
            }
          />
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pl-3 pr-3.5 py-2.5 [scrollbar-width:thin] max-md:overflow-visible max-md:flex-none">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
            <p className="text-[13px]" style={{ color: "#64748b" }}>
              Gathering latest news…
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-2">
            <p className="text-[13px]" style={{ color: "#94a3b8" }}>
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-[12px] font-semibold"
              style={{ color: "#60a5fa" }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : news ? (
          <div className="flex flex-col gap-3.5">
            {news.summary ? (
              <p className="text-[14px] leading-relaxed" style={{ color: "#cbd5e1" }}>
                {news.summary}
              </p>
            ) : null}

            {news.highlights.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {news.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-snug" style={{ color: "#94a3b8" }}>
                    <span style={{ color: "#3b82f6" }}>•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {news.citations.length > 0 ? (
              <div className="flex flex-col gap-2 pt-1">
                <p
                  className="text-[11px] font-black uppercase tracking-[0.14em]"
                  style={{ color: "#475569" }}
                >
                  Sources
                </p>
                {news.citations.map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-1.5 text-[13px] leading-snug transition-colors"
                    style={{ color: "#93c5fd" }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-70" />
                    <span className="min-w-0">
                      <span className="group-hover:underline">{c.title}</span>
                      <span className="block text-[11px]" style={{ color: "#64748b" }}>
                        {hostname(c.url)}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {news ? (
        <div
          className="shrink-0 pl-3 pr-3.5 py-1.5 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-[11px] leading-snug" style={{ color: "#475569" }}>
            AI summary{news.stale ? " (cached)" : ""} · {timeAgo(news.generatedAt)} · not investment advice
          </p>
          <button
            type="button"
            onClick={load}
            aria-label="Refresh news"
            className="shrink-0"
            style={{ color: "#64748b" }}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
