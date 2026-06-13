"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import {
  buildLevelsBubbleItems,
  type LevelsBubbleItem,
  type StockBubbleSource,
} from "@/components/levels/LevelsBubblesView";
import { BUBBLE_TONE_STYLE, type BubbleTone } from "@/lib/zones/bubble-tone";
import {
  bubbleMapFilterLabel,
  countSlideshowMapFilters,
  isSlideshowStripTone,
  SLIDESHOW_MAP_FILTER_KEYS,
  slideshowMatchesMapFilter,
  type SlideshowMapFilter,
} from "@/lib/zones/bubble-map-filter";
import { formatLevelsChartMeta, levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

/** Demo cadence — the live product advances every 60s; we speed it up for the walkthrough. */
const DEMO_SLIDE_SECONDS = 12;

type FeatureId = "filters" | "strip" | "chart" | "autoplay";

interface LevelsPayload {
  indices?: { symbol?: string; label: string; data: PublicLevels | null }[];
  stocks?: StockBubbleSource[];
}

const FEATURES: { id: FeatureId; title: string; body: string }[] = [
  {
    id: "filters",
    title: "Zone-qualified filters",
    body: "Liveslide only ever shows setups where price has reached a support or resistance zone with a healthy reward-to-max-pain. Filter to At Support, Near Support, At Resistance, or Near Resistance to focus the rotation on the side you care about.",
  },
  {
    id: "strip",
    title: "Symbol strip — jump to any aligned name",
    body: "Every qualifying index and F&O stock sits in the strip with its live spot and a status badge. The rotation auto-scrolls to the active name, but you can tap any tile to jump straight to it.",
  },
  {
    id: "chart",
    title: "Live chart with zone overlays",
    body: "Each slide draws the support and resistance bands, the Put and Call OI peaks, and the Max Pain line directly on a live candlestick chart — the same derived zones shown on the market map, in full chart context.",
  },
  {
    id: "autoplay",
    title: "Hands-free auto-advance — with pause",
    body: "Liveslide cycles through every aligned setup on a timer so you can scan the whole market without clicking. Pause the moment something catches your eye and study the chart and news as long as you like.",
  },
];

function toneAccent(tone: BubbleTone): { text: string; ring: string; tint: string } {
  const bull = tone === "IN_BULL" || tone === "NEAR_BULL";
  return bull
    ? { text: "#86efac", ring: "rgba(34,197,94,0.55)", tint: "rgba(34,197,94,0.12)" }
    : { text: "#fca5a5", ring: "rgba(239,68,68,0.55)", tint: "rgba(239,68,68,0.12)" };
}

function spotlightStyle(active: boolean): React.CSSProperties {
  return {
    transition: "box-shadow .3s ease, background-color .3s ease",
    boxShadow: active ? "inset 0 0 0 2px rgba(96,165,250,0.9)" : "inset 0 0 0 0 transparent",
    backgroundColor: active ? "rgba(37,99,235,0.08)" : undefined,
  };
}

function StatusBadge({ tone }: { tone: BubbleTone }) {
  const accent = toneAccent(tone);
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
      style={{ color: accent.text, backgroundColor: accent.tint, border: `1px solid ${accent.ring}` }}
    >
      {BUBBLE_TONE_STYLE[tone].label}
    </span>
  );
}

export function FnoNinjaLiveslideGuide() {
  const [payload, setPayload] = useState<LevelsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SlideshowMapFilter>("all");
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState(DEMO_SLIDE_SECONDS);
  const [levelsCache, setLevelsCache] = useState<Record<string, PublicLevels | null>>({});
  const [highlight, setHighlight] = useState<FeatureId | null>(null);

  const stripRef = useRef<HTMLDivElement>(null);
  const activeTileRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/freedombot/levels", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: LevelsPayload) => {
        if (!cancelled) setPayload(json);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stockBySymbol = useMemo(() => {
    const m = new Map<string, StockBubbleSource>();
    for (const s of payload?.stocks ?? []) m.set(s.symbol, s);
    return m;
  }, [payload?.stocks]);

  const aligned = useMemo<LevelsBubbleItem[]>(() => {
    if (!payload?.indices) return [];
    return buildLevelsBubbleItems(payload.indices, stockBySymbol).filter((it) =>
      isSlideshowStripTone(it.tone),
    );
  }, [payload?.indices, stockBySymbol]);

  const counts = useMemo(() => countSlideshowMapFilters(aligned), [aligned]);

  const filtered = useMemo(() => {
    return aligned
      .filter((it) => slideshowMatchesMapFilter(it.tone, filter))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [aligned, filter]);

  // Reset rotation when the filter narrows/changes the list.
  useEffect(() => {
    setSlideIndex(0);
  }, [filter]);

  // Restart the countdown whenever the active slide or filter changes.
  useEffect(() => {
    setCountdown(DEMO_SLIDE_SECONDS);
  }, [slideIndex, filter]);

  // Auto-advance timer.
  useEffect(() => {
    if (paused || filtered.length <= 1) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setSlideIndex((s) => (s + 1) % filtered.length);
          return DEMO_SLIDE_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paused, filtered.length]);

  const active = filtered.length ? filtered[Math.min(slideIndex, filtered.length - 1)] : null;

  // Keep the active strip tile scrolled into view.
  useEffect(() => {
    const tile = activeTileRef.current;
    const strip = stripRef.current;
    if (!tile || !strip) return;
    const left = tile.offsetLeft - strip.clientWidth / 2 + tile.clientWidth / 2;
    strip.scrollTo({ left, behavior: "smooth" });
  }, [active?.symbol]);

  // F&O stocks ship without full ladder data in bulk — fetch on demand.
  useEffect(() => {
    if (!active || active.scope !== "stock") return;
    if (levelsCache[active.symbol] !== undefined) return;
    let cancelled = false;
    void fetch(`/api/freedombot/levels?symbol=${encodeURIComponent(active.symbol)}&slideshow=1`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { data: PublicLevels | null }) => {
        if (!cancelled) setLevelsCache((prev) => ({ ...prev, [active.symbol]: json.data ?? null }));
      })
      .catch(() => {
        if (!cancelled) setLevelsCache((prev) => ({ ...prev, [active.symbol]: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [active?.symbol, active?.scope, levelsCache]);

  const activeLevels = active
    ? active.scope === "index"
      ? active.data
      : levelsCache[active.symbol] ?? null
    : null;
  const activeLevelsLoading = active ? active.scope === "stock" && levelsCache[active.symbol] === undefined : false;
  const tv = active ? levelsTradingViewParams(active.scope, active.symbol) : null;
  const accent = active ? toneAccent(active.tone) : null;

  return (
    <section>
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: FNO_ACCENT }}>
          See it live
        </p>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
          A live Liveslide, right here
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
          This is the real Liveslide running on live NSE data. Hover a feature below to see where it lives,
          change the filter, jump around the strip, or pause the rotation — exactly like the market map.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Live demo panel */}
        <div
          className="rounded-2xl overflow-hidden lg:sticky lg:top-20 self-start w-full"
          style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-24">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
              <span className="text-sm" style={{ color: "#64748b" }}>
                Loading live setups…
              </span>
            </div>
          ) : aligned.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <p className="text-sm font-semibold text-white mb-1">No setups are aligned right now</p>
              <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                Liveslide stays empty until price reaches a support or resistance zone with at least a 2:1
                reward to Max Pain. Check back during market hours.
              </p>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="px-3 py-2.5 border-b" style={{ borderColor: "rgba(90,140,220,0.12)", ...spotlightStyle(highlight === "filters") }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["all", ...SLIDESHOW_MAP_FILTER_KEYS] as SlideshowMapFilter[]).map((key) => {
                    const isActive = filter === key;
                    const count = counts[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
                        style={{
                          color: isActive ? "#fff" : count ? "#cbd5e1" : "#64748b",
                          backgroundColor: isActive ? "rgba(37,99,235,0.55)" : "rgba(90,140,220,0.08)",
                          border: isActive ? "1px solid rgba(96,165,250,0.7)" : "1px solid transparent",
                        }}
                      >
                        {bubbleMapFilterLabel(key)}
                        <span className="ml-1 tabular-nums opacity-70">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Symbol strip */}
              <div
                ref={stripRef}
                className="flex gap-2 overflow-x-auto px-3 py-2.5 border-b"
                style={{ borderColor: "rgba(90,140,220,0.12)", scrollbarWidth: "thin", ...spotlightStyle(highlight === "strip") }}
              >
                {filtered.length === 0 ? (
                  <span className="text-xs py-1.5" style={{ color: "#64748b" }}>
                    Nothing matches this filter right now.
                  </span>
                ) : (
                  filtered.map((it, i) => {
                    const isActive = it.symbol === active?.symbol;
                    const tAccent = toneAccent(it.tone);
                    return (
                      <button
                        key={it.id}
                        ref={isActive ? activeTileRef : undefined}
                        type="button"
                        onClick={() => setSlideIndex(i)}
                        className="shrink-0 rounded-lg px-2.5 py-1.5 text-left transition-all"
                        style={{
                          backgroundColor: isActive ? "rgba(37,99,235,0.18)" : "rgba(8,15,30,0.5)",
                          border: isActive
                            ? "1px solid rgba(96,165,250,0.6)"
                            : `1px solid ${tAccent.ring}`,
                          boxShadow: isActive ? "0 0 16px rgba(37,99,235,0.35)" : "none",
                        }}
                      >
                        <span className="block text-xs font-black text-white leading-none mb-0.5">
                          {it.symbol}
                        </span>
                        <span className="block text-[9px] font-semibold leading-none" style={{ color: tAccent.text }}>
                          {BUBBLE_TONE_STYLE[it.tone].label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Chart + header */}
              <div style={spotlightStyle(highlight === "chart")}>
                <div
                  className="px-3 py-2.5 border-b flex flex-wrap items-center gap-x-3 gap-y-1"
                  style={{ borderColor: "rgba(90,140,220,0.12)" }}
                >
                  <span className="font-black text-white text-sm">{active?.symbol}</span>
                  <span className="text-[11px] font-medium truncate max-w-[160px]" style={{ color: "#94a3b8" }}>
                    {active?.label}
                  </span>
                  {tv ? (
                    <span
                      className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em]"
                      style={{ color: "#64748b" }}
                    >
                      {formatLevelsChartMeta(tv)}
                    </span>
                  ) : null}
                  {active && accent ? (
                    <span
                      className="ml-auto rounded px-2 py-0.5 text-[10px] sm:text-[11px] font-bold"
                      style={{ color: accent.text, backgroundColor: accent.tint, border: `1px solid ${accent.ring}` }}
                    >
                      {BUBBLE_TONE_STYLE[active.tone].label}
                    </span>
                  ) : null}
                </div>

                <div className="relative w-full" style={{ height: 420, backgroundColor: "rgba(0,0,0,0.35)" }}>
                  {tv ? (
                    <NativeCandlesChart
                      key={`${active?.scope}-${active?.symbol}`}
                      symbol={tv.symbol}
                      candlesScope={tv.candlesScope}
                      interval="15"
                      levels={activeLevels}
                      loading={activeLevelsLoading}
                      webChartUrl={tv.webChartUrl}
                      hideShortcuts
                      defaultFullHistory
                    />
                  ) : null}
                </div>
              </div>

              {/* Auto-advance footer */}
              <div
                className="px-3 py-2.5 flex items-center gap-3"
                style={spotlightStyle(highlight === "autoplay")}
              >
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white transition-colors"
                  style={{ backgroundColor: "rgba(37,99,235,0.5)", border: "1px solid rgba(96,165,250,0.6)" }}
                >
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {paused ? "Play" : "Pause"}
                </button>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#94a3b8" }}>
                  {paused
                    ? "Paused — study this slide"
                    : filtered.length > 1
                      ? `Auto-advances in ${countdown}s`
                      : "Only one aligned setup"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {filtered.slice(0, 12).map((it, i) => (
                    <span
                      key={it.id}
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: i === Math.min(slideIndex, filtered.length - 1) ? 16 : 6,
                        backgroundColor:
                          i === Math.min(slideIndex, filtered.length - 1)
                            ? FNO_ACCENT
                            : "rgba(148,163,184,0.3)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Feature walkthrough */}
        <div className="space-y-3">
          {FEATURES.map((feature, i) => {
            const isOn = highlight === feature.id;
            return (
              <button
                key={feature.id}
                type="button"
                onMouseEnter={() => setHighlight(feature.id)}
                onMouseLeave={() => setHighlight(null)}
                onFocus={() => setHighlight(feature.id)}
                onBlur={() => setHighlight(null)}
                className="block w-full rounded-xl p-4 text-left transition-all"
                style={{
                  backgroundColor: isOn ? "rgba(37,99,235,0.1)" : FNO_CARD_BG,
                  border: isOn ? "1px solid rgba(96,165,250,0.45)" : FNO_CARD_BORDER,
                }}
              >
                <span
                  className="block text-[10px] font-bold uppercase tracking-[0.2em] mb-1.5"
                  style={{ color: FNO_ACCENT }}
                >
                  Feature {i + 1}
                </span>
                <span className="block text-sm font-bold text-white mb-1.5">{feature.title}</span>
                <span className="block text-[13px] leading-relaxed" style={{ color: "#94a3b8" }}>
                  {feature.body}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
