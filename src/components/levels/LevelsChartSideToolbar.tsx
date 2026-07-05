"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  GalleryHorizontal,
  GraduationCap,
  Loader2,
  MessageCircle,
  Newspaper,
  Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AskFynn } from "@/components/fnoninja/AskFynn";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { FnoNinjaFavslideToggle } from "@/components/fnoninja/FnoNinjaFavslideToggle";
import { LevelsNewsPanel } from "@/components/levels/LevelsNewsPanel";
import { LevelsSymbolShareButton } from "@/components/levels/LevelsSymbolShareButton";
import type { NativeCandlesChartHandle } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
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
  FNO_FAVSLIDE_ACCENT,
  FNO_LIVESLIDE_ACCENT,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";

const TOOLBAR_WIDTH_CLASS = "w-14";

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
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <ToolbarHoverLabel label={label}>
      <button
        type="button"
        onClick={onClick}
        title={title ?? label}
        aria-label={label}
        aria-pressed={active}
        className={`flex flex-col items-center justify-center gap-0.5 ${TOOLBAR_WIDTH_CLASS} min-h-[3rem] rounded-md transition-colors hover:bg-white/[0.06] data-[active=true]:bg-white/[0.08] shrink-0`}
        data-active={active ? "true" : undefined}
        style={{
          color: active ? FNO_ACCENT : "#94a3b8",
        }}
      >
        {children}
      </button>
    </ToolbarHoverLabel>
  );
}

function BubblesMapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="currentColor">
      <circle cx="6.5" cy="10" r="3.65" />
      <circle cx="14" cy="7" r="3.1" />
      <circle cx="13.5" cy="14.5" r="2.55" />
    </svg>
  );
}

function NewsSentimentTag({ sentiment }: { sentiment: NewsSentiment | null }) {
  if (!sentiment) {
    return (
      <span className="text-[7px] font-semibold uppercase tracking-wide leading-none" style={{ color: FNO_MUTED }}>
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
  return (
    <span
      className="max-w-[2.75rem] truncate text-[7px] font-bold tabular-nums leading-none"
      style={{ color: tone }}
      title={`${sentiment.score} · ${sentiment.label}`}
    >
      {sentiment.score}
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
  className = "",
}: {
  scope: LevelsTvScope;
  symbol: string;
  label?: string | null;
  levels?: PublicLevels | null;
  expiryKey?: string | null;
  nativeChartRef?: React.RefObject<NativeCandlesChartHandle | null>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { open: chatOpen, setOpen: setChatOpen } = useChatPanel();
  const [newsOpen, setNewsOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [newsSentiment, setNewsSentiment] = useState<NewsSentiment | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);

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

  useEffect(() => {
    setNewsOpen(false);
    setAtlasOpen(false);
  }, [scope, symbol]);

  const goToBubbles = useCallback(() => {
    const path = levelsBubblesPagePathForHost(
      typeof window !== "undefined" ? window.location.hostname : "fnoninja.com",
    );
    if (path.startsWith("http")) {
      window.location.href = path;
      return;
    }
    router.push(path);
  }, [router]);

  const goToFavslide = useCallback(() => {
    router.push(fnoFavslideHref(pathname));
  }, [router, pathname]);

  const goToLiveslide = useCallback(() => {
    router.push(fnoLiveslideHref(pathname));
  }, [router, pathname]);

  const goToLearn = useCallback(() => {
    router.push(fnoLearnHref(pathname));
  }, [router, pathname]);

  const handleChecklist = () => {
    toast({
      title: "Checklist",
      description: "Trade checklist — coming soon.",
    });
  };

  return (
    <>
      <aside
        className={`flex flex-col items-center gap-0.5 shrink-0 py-2 px-1 border-r border-white/[0.06] ${TOOLBAR_WIDTH_CLASS} ${className}`.trim()}
        style={{ backgroundColor: FNO_BG_CANVAS }}
        aria-label="Chart tools"
      >
        <ToolbarButton
          label="News"
          active={newsOpen}
          onClick={() => setNewsOpen(true)}
          title="Recent news and sentiment"
        >
          {newsLoading ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin shrink-0" strokeWidth={1.75} />
          ) : (
            <Newspaper className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          )}
          <NewsSentimentTag sentiment={newsSentiment} />
        </ToolbarButton>

        <ToolbarButton
          label="Atlas AI"
          active={atlasOpen}
          onClick={() => setAtlasOpen(true)}
          title="Atlas AI coach"
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0 fynn-sparkle-glow" strokeWidth={1.75} />
        </ToolbarButton>

        <ToolbarButton
          label="Chat"
          active={chatOpen}
          onClick={() => setChatOpen(true)}
          title="Community chat"
        >
          <MessageCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
        </ToolbarButton>

        <ToolbarButton
          label="Checklist"
          onClick={handleChecklist}
          title="Trade checklist (coming soon)"
        >
          <ClipboardList className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
        </ToolbarButton>

        <div className="my-0.5 h-px w-9 shrink-0 bg-white/[0.08]" aria-hidden />

        <ToolbarHoverLabel label="Favorite">
          <FnoNinjaFavslideToggle scope={scope} symbol={symbol} enabled variant="toolbar" />
        </ToolbarHoverLabel>

        <ToolbarButton
          label="View bubble chart"
          onClick={goToBubbles}
          title="View Market Bubbles map"
        >
          <BubblesMapIcon className="h-[18px] w-[18px] shrink-0" />
        </ToolbarButton>

        <ToolbarButton
          label="Favslide"
          onClick={goToFavslide}
          title="Cycle your favourited stocks"
        >
          <GalleryHorizontal
            className="h-[18px] w-[18px] shrink-0"
            strokeWidth={1.75}
            style={{ color: FNO_FAVSLIDE_ACCENT }}
          />
        </ToolbarButton>

        <ToolbarButton
          label="Liveslide"
          onClick={goToLiveslide}
          title="Cycle aligned market setups"
        >
          <GalleryHorizontal className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} style={{ color: FNO_LIVESLIDE_ACCENT }} />
        </ToolbarButton>

        <ToolbarButton
          label="Learn"
          onClick={goToLearn}
          title="Guides and tutorials"
        >
          <GraduationCap className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
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

      <Sheet open={newsOpen} onOpenChange={setNewsOpen}>
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
        onOpenChange={setAtlasOpen}
      />
    </>
  );
}
