"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  GraduationCap,
  Loader2,
  MessageCircle,
  Newspaper,
  Sparkles,
} from "lucide-react";
import { AskFynn } from "@/components/fnoninja/AskFynn";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { FnoNinjaFavslideToggle } from "@/components/fnoninja/FnoNinjaFavslideToggle";
import { LevelsNewsPanel } from "@/components/levels/LevelsNewsPanel";
import { LevelsSymbolShareButton } from "@/components/levels/LevelsSymbolShareButton";
import {
  LEVELS_CHART_TOOLBAR_BTN_CLASS,
  LEVELS_CHART_TOOLBAR_ICON_CLASS,
  LEVELS_CHART_TOOLBAR_TAG_CLASS,
  LEVELS_CHART_TOOLBAR_WIDTH_CLASS,
} from "@/components/levels/levels-chart-toolbar";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import type { FnoNinjaFavslideApi } from "@/hooks/useFnoNinjaFavslide";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  LEVELS_NEWS_WINDOW_DAYS,
  type LevelsNews,
  type NewsSentiment,
} from "@/lib/levels/news-types";
import { levelsBubblesPagePathForHost } from "@/lib/levels/levels-chart-url";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import {
  fnoFavslideHref,
  fnoLearnHref,
  fnoLiveslideHref,
} from "@/lib/fnoninja/paths";
import {
  FNO_ACCENT,
  FNO_BG_CANVAS,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

const TOOLBAR_WIDTH_CLASS = LEVELS_CHART_TOOLBAR_WIDTH_CLASS;
const TOOLBAR_ICON_CLASS = LEVELS_CHART_TOOLBAR_ICON_CLASS;

function sentimentToolbarLabel(label: NewsSentiment["label"]): string {
  if (label === "bullish") return "Bullish";
  if (label === "bearish") return "Bearish";
  return "Neutral";
}

function ToolbarHoverLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={`group/item relative flex shrink-0 ${TOOLBAR_WIDTH_CLASS}`}>
      {children}
      <span
        className="pointer-events-none absolute left-[calc(100%+6px)] top-1/2 z-[220] -translate-y-1/2 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold opacity-0 shadow-lg transition-opacity duration-150 group-hover/item:opacity-100"
        style={{
          color: "#e2e8f0",
          backgroundColor: "rgba(15,23,42,0.96)",
          borderColor: "rgba(255,255,255,0.1)",
        }}
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
  title,
  dataAttrs,
  unreadCount,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  dataAttrs?: Record<string, string>;
  /** Unread badge count (hidden when active). */
  unreadCount?: number;
}) {
  const showBadge = (unreadCount ?? 0) > 0 && !active;
  return (
    <ToolbarHoverLabel label={label}>
      <button
        type="button"
        onClick={onClick}
        title={title ?? label}
        aria-label={showBadge ? `${label}, ${unreadCount} unread` : label}
        aria-pressed={active}
        className={`relative ${LEVELS_CHART_TOOLBAR_BTN_CLASS} ${TOOLBAR_WIDTH_CLASS} data-[active=true]:bg-white/[0.08] shrink-0`}
        data-active={active ? "true" : undefined}
        style={{
          color: active ? FNO_ACCENT : "#94a3b8",
        }}
        {...dataAttrs}
      >
        {children}
        {showBadge ? (
          <ChatUnreadBadge count={unreadCount!} className="absolute right-1 top-1" />
        ) : null}
      </button>
    </ToolbarHoverLabel>
  );
}

function ToolbarCircleLetter({ letter }: { letter: string }) {
  return (
    <span
      className="flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[11px] font-bold leading-none tabular-nums"
      style={{
        color: "#94a3b8",
        borderColor: "rgba(148,163,184,0.4)",
      }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

interface AtlasScore {
  composite: number;
  directionLabel: "bullish" | "neutral" | "bearish";
}

function atlasScoreColor(v: number): string {
  if (v >= 70) return "#86efac";
  if (v >= 50) return "#fcd34d";
  return "#fca5a5";
}

function AtlasScoreTag({ score }: { score: AtlasScore | null }) {
  if (!score) {
    return (
      <span className={LEVELS_CHART_TOOLBAR_TAG_CLASS} style={{ color: FNO_MUTED }}>
        ···
      </span>
    );
  }
  return (
    <span
      className={`${LEVELS_CHART_TOOLBAR_TAG_CLASS} tabular-nums`}
      style={{ color: atlasScoreColor(score.composite) }}
      title={`Setup score ${score.composite}/100 · ${score.directionLabel}`}
    >
      {score.composite}
    </span>
  );
}

function NewsSentimentTag({ sentiment }: { sentiment: NewsSentiment | null }) {
  if (!sentiment) {
    return (
      <span className={LEVELS_CHART_TOOLBAR_TAG_CLASS} style={{ color: FNO_MUTED }}>
        ···
      </span>
    );
  }
  const tone =
    sentiment.label === "bullish"
      ? "#86efac"
      : sentiment.label === "bearish"
        ? "#fca5a5"
        : "#94a3b8";
  const label = sentimentToolbarLabel(sentiment.label);
  return (
    <span
      className={LEVELS_CHART_TOOLBAR_TAG_CLASS}
      style={{ color: tone }}
      title={`${label} · score ${sentiment.score}`}
    >
      {label}
    </span>
  );
}

/**
 * TradingView-style vertical toolbar — left rail on the deep-dive chart page.
 */
export function LevelsChartSideToolbar({
  scope,
  symbol,
  label,
  levels,
  expiryKey,
  nativeChartRef,
  favslideApi,
  favslideRemoveOnly = false,
  onAtlasOpenChange,
  onNewsOpenChange,
  onNavigateBubbles,
  onNavigateFavslide,
  onNavigateLiveslide,
  className = "",
}: {
  scope: LevelsTvScope;
  symbol: string;
  label?: string | null;
  levels?: PublicLevels | null;
  expiryKey?: string | null;
  nativeChartRef?: React.RefObject<NativeCandlesChartHandle | null>;
  favslideApi?: FnoNinjaFavslideApi;
  favslideRemoveOnly?: boolean;
  onAtlasOpenChange?: (open: boolean) => void;
  onNewsOpenChange?: (open: boolean) => void;
  /** When set (levels slideshow), switch view in-place instead of router-only navigation. */
  onNavigateBubbles?: () => void;
  onNavigateFavslide?: () => void;
  onNavigateLiveslide?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { open: chatOpen, setOpen: setChatOpen, totalUnreadCount } = useChatPanel();
  const [newsOpen, setNewsOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [newsSentiment, setNewsSentiment] = useState<NewsSentiment | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [atlasScore, setAtlasScore] = useState<AtlasScore | null>(null);

  const loadNewsSentiment = useCallback(async () => {
    if (!symbol || (scope !== "stock" && scope !== "index")) return;
    setNewsLoading(true);
    try {
      const res = await fetch(
        `/api/freedombot/levels/news?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(symbol)}&window=${LEVELS_NEWS_WINDOW_DAYS}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { ok?: boolean; news?: LevelsNews };
      if (json.ok && json.news?.sentiment) {
        setNewsSentiment(json.news.sentiment);
      } else {
        setNewsSentiment(null);
      }
    } catch {
      setNewsSentiment(null);
    } finally {
      setNewsLoading(false);
    }
  }, [scope, symbol]);

  useEffect(() => {
    void loadNewsSentiment();
  }, [loadNewsSentiment]);

  const loadAtlasScore = useCallback(async () => {
    if (!symbol || (scope !== "stock" && scope !== "index")) return;
    setAtlasScore(null);
    try {
      const res = await fetch(
        `/api/freedombot/levels/score?scope=${encodeURIComponent(scope)}&symbol=${encodeURIComponent(symbol)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { ok?: boolean; score?: AtlasScore };
      setAtlasScore(json.ok && json.score ? json.score : null);
    } catch {
      setAtlasScore(null);
    }
  }, [scope, symbol]);

  useEffect(() => {
    void loadAtlasScore();
  }, [loadAtlasScore]);

  const handleAtlasOpenChange = useCallback(
    (open: boolean) => {
      setAtlasOpen(open);
      onAtlasOpenChange?.(open);
    },
    [onAtlasOpenChange],
  );

  const handleNewsOpenChange = useCallback(
    (open: boolean) => {
      setNewsOpen(open);
      onNewsOpenChange?.(open);
    },
    [onNewsOpenChange],
  );

  useEffect(() => {
    setNewsOpen(false);
    setAtlasOpen(false);
    onAtlasOpenChange?.(false);
    onNewsOpenChange?.(false);
  }, [scope, symbol, onAtlasOpenChange, onNewsOpenChange]);

  const goToBubbles = useCallback(() => {
    if (onNavigateBubbles) {
      onNavigateBubbles();
      return;
    }
    const path = levelsBubblesPagePathForHost(
      typeof window !== "undefined" ? window.location.hostname : "fnoninja.com",
    );
    if (path.startsWith("http")) {
      window.location.href = path;
      return;
    }
    router.push(path);
  }, [router, onNavigateBubbles]);

  const goToFavslide = useCallback(() => {
    if (onNavigateFavslide) {
      onNavigateFavslide();
      return;
    }
    router.push(fnoFavslideHref(pathname));
  }, [router, pathname, onNavigateFavslide]);

  const goToLiveslide = useCallback(() => {
    if (onNavigateLiveslide) {
      onNavigateLiveslide();
      return;
    }
    router.push(fnoLiveslideHref(pathname));
  }, [router, pathname, onNavigateLiveslide]);

  const goToLearn = useCallback(() => {
    router.push(fnoLearnHref(pathname));
  }, [router, pathname]);

  return (
    <>
      <aside
        className={`flex flex-col items-center gap-1 shrink-0 py-2 px-1.5 border-r border-white/[0.06] ${TOOLBAR_WIDTH_CLASS} ${className}`.trim()}
        style={{ backgroundColor: FNO_BG_CANVAS }}
        aria-label="Chart tools"
      >
        <ToolbarButton
          label="News"
          active={newsOpen}
          onClick={() => handleNewsOpenChange(true)}
          title="Recent news and sentiment"
          dataAttrs={{
            "data-liveslide-tour": "news",
            "data-favslide-tour": "news",
          }}
        >
          {newsLoading ? (
            <Loader2 className={`${TOOLBAR_ICON_CLASS} animate-spin`} strokeWidth={1.5} />
          ) : (
            <Newspaper className={TOOLBAR_ICON_CLASS} strokeWidth={1.5} />
          )}
          <NewsSentimentTag sentiment={newsSentiment} />
        </ToolbarButton>

        <ToolbarButton
          label="Atlas AI"
          active={atlasOpen}
          onClick={() => setAtlasOpen(true)}
          title="Atlas AI coach — setup score"
        >
          <Sparkles className={`${TOOLBAR_ICON_CLASS} fynn-sparkle-glow`} strokeWidth={1.5} />
          <AtlasScoreTag score={atlasScore} />
        </ToolbarButton>

        <ToolbarButton
          label="Chat"
          active={chatOpen}
          unreadCount={chatOpen ? 0 : totalUnreadCount}
          onClick={() => setChatOpen(true)}
          title={
            totalUnreadCount > 0 && !chatOpen
              ? `Community chat — ${totalUnreadCount} unread`
              : "Community chat"
          }
        >
          <MessageCircle className={TOOLBAR_ICON_CLASS} strokeWidth={1.5} />
        </ToolbarButton>

        <div className="my-0.5 h-px w-10 shrink-0 bg-white/[0.08]" aria-hidden />

        <ToolbarHoverLabel label="Favorite">
          <div data-favslide-tour="remove">
            <FnoNinjaFavslideToggle
              scope={scope}
              symbol={symbol}
              enabled
              variant="toolbar"
              removeOnly={favslideRemoveOnly}
              api={favslideApi}
            />
          </div>
        </ToolbarHoverLabel>

        <ToolbarButton
          label="View bubble chart"
          onClick={goToBubbles}
          title="View Market Bubbles map"
          dataAttrs={{
            "data-liveslide-tour": "bubbles",
            "data-favslide-tour": "bubbles",
          }}
        >
          <ToolbarCircleLetter letter="B" />
        </ToolbarButton>

        <ToolbarButton
          label="Favslide"
          onClick={goToFavslide}
          title="Cycle your favourited stocks"
          dataAttrs={{
            "data-favslide-tour": "fav-switch",
            "data-liveslide-tour": "fav-switch",
          }}
        >
          <ToolbarCircleLetter letter="F" />
        </ToolbarButton>

        <ToolbarButton
          label="Liveslide"
          onClick={goToLiveslide}
          title="Cycle aligned market setups"
          dataAttrs={{
            "data-liveslide-tour": "live-switch",
            "data-favslide-tour": "live-switch",
          }}
        >
          <ToolbarCircleLetter letter="L" />
        </ToolbarButton>

        <ToolbarButton
          label="Learn"
          onClick={goToLearn}
          title="Guides and tutorials"
        >
          <GraduationCap className={TOOLBAR_ICON_CLASS} strokeWidth={1.5} />
        </ToolbarButton>

        <ToolbarHoverLabel label="Share">
          <LevelsSymbolShareButton
            scope={scope}
            symbol={symbol}
            label={label}
            levels={levels}
            expiryKey={expiryKey}
            nativeChartRef={nativeChartRef}
            variant="toolbar"
          />
        </ToolbarHoverLabel>
      </aside>

      <Sheet open={newsOpen} onOpenChange={handleNewsOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-hidden border-l p-0 z-[210] !top-14 sm:!top-16 !bottom-0 !h-[calc(100dvh-3.5rem)] sm:!h-[calc(100dvh-4rem)] max-h-none"
          style={{ backgroundColor: FNO_BG_CANVAS }}
        >
          <div className="flex h-full flex-col p-3 sm:p-4 pr-12">
            <LevelsNewsPanel
              scope={scope === "index" ? "index" : "stock"}
              symbol={symbol}
              className="flex-1 min-h-0 border-0 bg-transparent"
            />
          </div>
        </SheetContent>
      </Sheet>

      <AskFynn
        scope={scope}
        symbol={symbol}
        label={label ?? undefined}
        hideTrigger
        open={atlasOpen}
        onOpenChange={handleAtlasOpenChange}
      />
    </>
  );
}
