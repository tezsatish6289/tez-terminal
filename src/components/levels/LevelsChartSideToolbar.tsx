"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  GraduationCap,
  Loader2,
  MessageCircle,
  Newspaper,
} from "lucide-react";
import { AskFynn } from "@/components/fnoninja/AskFynn";
import { useScoreAlertsOptional } from "@/components/fnoninja/alerts/ScoreAlertsContext";
import { ChatUnreadBadge } from "@/components/fnoninja/chat/ChatUnreadBadge";
import { useChatPanel } from "@/components/fnoninja/chat/ChatPanelContext";
import { FnoNinjaToolbarSignInPrompt } from "@/components/fnoninja/FnoNinjaChartLoginGate";
import { FnoNinjaFavslideToggle } from "@/components/fnoninja/FnoNinjaFavslideToggle";
import type { FnoToolbarSignInAction } from "@/lib/fnoninja/login-copy";
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
  FNO_BG_CANVAS,
  FNO_MUTED,
} from "@/lib/fnoninja/theme";
import { trackCtaClick } from "@/firebase/analytics";
import { useAuth, useUser } from "@/firebase";
import { isFnoNinjaAppContext, isFnoNinjaChartPath } from "@/lib/fnoninja/auth";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useUpgradePrompt } from "@/components/fnoninja/FnoNinjaUpgradePrompt";
import type { Feature } from "@/lib/entitlements";

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
  flat = false,
  onClick,
  children,
  title,
  dataAttrs,
  unreadCount,
}: {
  label: string;
  active?: boolean;
  /** No highlight / accent — icon stays flat even when active. */
  flat?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  dataAttrs?: Record<string, string>;
  /** Unread badge count (hidden when active). */
  unreadCount?: number;
}) {
  const showActive = !flat && active;
  const showBadge = (unreadCount ?? 0) > 0 && !showActive;
  return (
    <ToolbarHoverLabel label={label}>
      <button
        type="button"
        onClick={onClick}
        title={title ?? label}
        aria-label={showBadge ? `${label}, ${unreadCount} unread` : label}
        aria-pressed={showActive ? true : undefined}
        className={`relative ${LEVELS_CHART_TOOLBAR_BTN_CLASS} ${TOOLBAR_WIDTH_CLASS} shrink-0 ${
          showActive ? "bg-white/[0.08]" : ""
        }`}
        style={{
          color: "#94a3b8",
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

/** Gemini-style AI mark — gradient sparkle + soft pulse; stands apart from B/W/L nav. */
function AtlasAiToolbarMark({ open }: { open: boolean }) {
  const gradId = useId().replace(/:/g, "");
  return (
    <span className={`atlas-ai-cta${open ? " atlas-ai-cta-open" : ""}`} aria-hidden>
      <span className="atlas-ai-cta-orb">
        <span className="atlas-ai-cta-ring" />
        <svg className="atlas-ai-cta-sparkle" viewBox="0 0 24 24" width="18" height="18">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="45%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
          </defs>
          {/* Four-point sparkle — AI signifier */}
          <path
            fill={`url(#${gradId})`}
            d="M12 1.6c.35 3.7 2.05 6.4 5.55 8.05C14.05 11.3 12.35 14 12 17.7c-.35-3.7-2.05-6.4-5.55-8.05C9.95 8 11.65 5.3 12 1.6Z"
          />
          <path
            fill={`url(#${gradId})`}
            opacity="0.9"
            d="M18.8 3.2c.18 1.55.9 2.65 2.35 3.35-1.45.7-2.17 1.8-2.35 3.35-.18-1.55-.9-2.65-2.35-3.35 1.45-.7 2.17-1.8 2.35-3.35Z"
          />
        </svg>
      </span>
      <span className="atlas-ai-cta-label">AI</span>
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
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { setOpen: setChatOpen, totalUnreadCount } = useChatPanel();
  const scoreAlerts = useScoreAlertsOptional();
  const [newsOpen, setNewsOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [signInAction, setSignInAction] = useState<FnoToolbarSignInAction | null>(null);
  const [newsSentiment, setNewsSentiment] = useState<NewsSentiment | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const pendingToolbarActionRef = useRef<(() => void) | null>(null);
  const wasSignedInRef = useRef(false);

  const gateToolbarActions =
    isFnoNinjaAppContext(
      pathname,
      typeof window !== "undefined" ? window.location.hostname : undefined,
    ) && isFnoNinjaChartPath(pathname);

  /** Firebase user in React state, or sync currentUser right after popup OAuth. */
  const isSignedIn = Boolean(user ?? auth.currentUser);

  const { has: hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { promptUpgrade } = useUpgradePrompt();

  /**
   * Upsell nudge for tier-gated features (Atlas / FavSlide / LiveSlide are
   * excluded from Silver). Only fires for a signed-in user on the FnoNinja app
   * whose active tier does NOT include the feature — the guest preview and the
   * sign-in gate are left untouched. The entry point stays visible; clicking it
   * surfaces the upgrade prompt (rather than hiding it or redirecting). Returns
   * true when locked so callers can bail out of the action.
   */
  const nudgeIfFeatureLocked = useCallback(
    (feature: Feature): boolean => {
      if (!gateToolbarActions || entitlementsLoading || !isSignedIn) return false;
      if (hasFeature(feature)) return false;
      trackCtaClick("toolbar_feature_locked", { feature, symbol, scope });
      promptUpgrade(feature);
      return true;
    },
    [gateToolbarActions, entitlementsLoading, isSignedIn, hasFeature, promptUpgrade, symbol, scope],
  );

  const dismissSignInPrompt = useCallback(() => {
    pendingToolbarActionRef.current = null;
    setSignInAction(null);
  }, []);

  const hideSignInPrompt = useCallback(() => {
    setSignInAction(null);
  }, []);

  const runIfSignedIn = useCallback(
    (action: FnoToolbarSignInAction, fn: () => void) => {
      if (!gateToolbarActions) {
        fn();
        return;
      }
      if (isUserLoading) return;
      if (isSignedIn) {
        fn();
        return;
      }
      pendingToolbarActionRef.current = fn;
      setSignInAction(action);
    },
    [gateToolbarActions, isSignedIn, isUserLoading],
  );

  // Close the sign-in overlay once auth resolves; run the action the user originally clicked.
  useEffect(() => {
    if (isUserLoading) return;

    if (isSignedIn) {
      setSignInAction(null);
      if (!wasSignedInRef.current && pendingToolbarActionRef.current) {
        const pending = pendingToolbarActionRef.current;
        pendingToolbarActionRef.current = null;
        pending();
      }
    }

    wasSignedInRef.current = isSignedIn;
  }, [isSignedIn, isUserLoading]);

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
    runIfSignedIn("bubbles", () => {
      trackCtaClick("toolbar_view_bubbles", { label: "View bubble chart", symbol, scope });
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
    });
  }, [router, onNavigateBubbles, symbol, scope, runIfSignedIn]);

  const goToFavslide = useCallback(() => {
    runIfSignedIn("favslide", () => {
      // No tier gate: Silver enters the manual Favourites view, everyone else
      // gets auto-play FavSlide (expired users hit the paywall on arrival).
      trackCtaClick("toolbar_view_favslide", { label: "Favslide", symbol, scope });
      if (onNavigateFavslide) {
        onNavigateFavslide();
        return;
      }
      router.push(fnoFavslideHref(pathname));
    });
  }, [router, pathname, onNavigateFavslide, symbol, scope, runIfSignedIn]);

  const goToLiveslide = useCallback(() => {
    runIfSignedIn("liveslide", () => {
      // No tier gate: Silver enters manual Livelist, paid tiers get autoplay,
      // expired users hit the paywall on arrival.
      trackCtaClick("toolbar_view_liveslide", { label: "Liveslide", symbol, scope });
      if (onNavigateLiveslide) {
        onNavigateLiveslide();
        return;
      }
      router.push(fnoLiveslideHref(pathname));
    });
  }, [router, pathname, onNavigateLiveslide, symbol, scope, runIfSignedIn]);

  const goToLearn = useCallback(() => {
    trackCtaClick("toolbar_learn", { label: "Learn", symbol, scope });
    router.push(fnoLearnHref(pathname));
  }, [router, pathname, symbol, scope]);

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
          onClick={() => {
            runIfSignedIn("news", () => {
              trackCtaClick("toolbar_news", { label: "News", symbol, scope });
              handleNewsOpenChange(true);
            });
          }}
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
          onClick={() => {
            runIfSignedIn("atlas", () => {
              trackCtaClick("toolbar_atlas", { label: "Atlas AI", symbol, scope });
              if (nudgeIfFeatureLocked("atlas_ai")) return;
              handleAtlasOpenChange(true);
            });
          }}
          title="Atlas AI — validate your trade idea"
          dataAttrs={{
            "data-liveslide-tour": "atlas",
            "data-favslide-tour": "atlas",
          }}
        >
          <AtlasAiToolbarMark open={atlasOpen} />
        </ToolbarButton>

        <ToolbarButton
          label="Chat with community"
          flat
          unreadCount={totalUnreadCount}
          onClick={() => {
            runIfSignedIn("chat", () => {
              trackCtaClick("toolbar_chat", { label: "Chat", symbol, scope });
              setChatOpen(true);
            });
          }}
          title={
            totalUnreadCount > 0
              ? `Chat with community — ${totalUnreadCount} unread`
              : "Chat with community"
          }
        >
          <MessageCircle className={TOOLBAR_ICON_CLASS} strokeWidth={1.5} />
        </ToolbarButton>

        {scoreAlerts ? (
          <ToolbarButton
            label="Score alerts"
            flat
            unreadCount={scoreAlerts.unreadCount}
            onClick={() => {
              runIfSignedIn("alerts", () => {
                trackCtaClick("toolbar_score_alerts", { label: "Score alerts", symbol, scope });
                scoreAlerts.setDrawerOpen(true);
              });
            }}
            title={
              scoreAlerts.unreadCount > 0
                ? `Score alerts — ${scoreAlerts.unreadCount} unread`
                : "Score alerts"
            }
          >
            <Bell className={TOOLBAR_ICON_CLASS} strokeWidth={1.5} />
          </ToolbarButton>
        ) : null}

        <div className="my-0.5 h-px w-10 shrink-0 bg-white/[0.08]" aria-hidden />

        <ToolbarHoverLabel label="Add to watchlist">
          <div
            data-favslide-tour="remove"
            onClick={() => trackCtaClick("favslide_toggle", { label: "Favorite", symbol, scope })}
          >
            <FnoNinjaFavslideToggle
              scope={scope}
              symbol={symbol}
              enabled
              variant="toolbar"
              removeOnly={favslideRemoveOnly}
              api={favslideApi}
              onSignInRequired={
                gateToolbarActions && !isUserLoading && !isSignedIn
                  ? () => {
                      pendingToolbarActionRef.current = null;
                      setSignInAction("favorite");
                    }
                  : undefined
              }
            />
          </div>
        </ToolbarHoverLabel>

        <ToolbarButton
          label="View Bubble Chart"
          flat
          onClick={goToBubbles}
          title="View Bubble Chart"
          dataAttrs={{
            "data-liveslide-tour": "bubbles",
            "data-favslide-tour": "bubbles",
          }}
        >
          <ToolbarCircleLetter letter="B" />
        </ToolbarButton>

        <ToolbarButton
          label="Watchlist"
          flat
          onClick={goToFavslide}
          title="Watchlist"
          dataAttrs={{
            "data-favslide-tour": "fav-switch",
            "data-liveslide-tour": "fav-switch",
          }}
        >
          <ToolbarCircleLetter letter="W" />
        </ToolbarButton>

        <ToolbarButton
          label="Livelist"
          flat
          onClick={goToLiveslide}
          title="Livelist"
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

      <FnoNinjaToolbarSignInPrompt
        open={signInAction != null && !isSignedIn}
        action={signInAction}
        onDismiss={dismissSignInPrompt}
        onSignedIn={hideSignInPrompt}
      />
    </>
  );
}
