"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Newspaper, RefreshCw } from "lucide-react";
import type { LevelsNews, NewsWindow } from "@/lib/levels/news";

const WINDOW_OPTIONS: { value: NewsWindow; label: string }[] = [
  { value: 28, label: "4 weeks" },
  { value: 14, label: "2 weeks" },
];

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

/**
 * Right-rail recent news for a levels symbol (stock or index).
 * AI-grounded summary + citations from /api/freedombot/levels/news.
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
  const [window, setWindow] = useState<NewsWindow>(28);
  const [news, setNews] = useState<LevelsNews | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/freedombot/levels/news?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(symbol)}&window=${window}`,
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
  }, [scope, symbol, window]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className={`flex flex-col min-h-0 h-full rounded-xl overflow-hidden ${className}`.trim()}
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        backgroundColor: "rgba(0,0,0,0.35)",
      }}
    >
      <div
        className="shrink-0 flex items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Newspaper className="h-3.5 w-3.5 shrink-0" style={{ color: "#60a5fa" }} />
          <span
            className="text-[11px] font-black uppercase tracking-[0.12em] truncate"
            style={{ color: "#e2e8f0" }}
          >
            Recent News
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {WINDOW_OPTIONS.map((opt) => {
            const active = window === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWindow(opt.value)}
                className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors"
                style={{
                  color: active ? "#dbeafe" : "#64748b",
                  backgroundColor: active ? "rgba(37,99,235,0.28)" : "transparent",
                  border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 [scrollbar-width:thin]">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#60a5fa" }} />
            <p className="text-[11px]" style={{ color: "#64748b" }}>
              Gathering latest news…
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-2">
            <p className="text-[11px]" style={{ color: "#94a3b8" }}>
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: "#60a5fa" }}
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        ) : news ? (
          <div className="flex flex-col gap-3">
            {news.summary ? (
              <p className="text-[12px] leading-relaxed" style={{ color: "#cbd5e1" }}>
                {news.summary}
              </p>
            ) : null}

            {news.highlights.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {news.highlights.map((h, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] leading-snug" style={{ color: "#94a3b8" }}>
                    <span style={{ color: "#3b82f6" }}>•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {news.citations.length > 0 ? (
              <div className="flex flex-col gap-1.5 pt-1">
                <p
                  className="text-[9px] font-black uppercase tracking-[0.14em]"
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
                    className="group flex items-start gap-1.5 text-[11px] leading-snug transition-colors"
                    style={{ color: "#93c5fd" }}
                  >
                    <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-70" />
                    <span className="min-w-0">
                      <span className="group-hover:underline">{c.title}</span>
                      <span className="block text-[9px]" style={{ color: "#64748b" }}>
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
          className="shrink-0 px-3 py-1.5 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-[9px] leading-snug" style={{ color: "#475569" }}>
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
