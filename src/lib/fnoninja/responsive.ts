/** Layout tokens for fnoninja.com marketing pages. */
export const FNO_PAGE_ROOT =
  "min-h-dvh w-full overflow-x-hidden flex flex-col";

/** Must match fixed nav outer height (FNO_NAV_HEIGHT_CLASS with box-border). */
export const FNO_NAV_SPACER_CLASS = "h-14 sm:h-16";

/** One marketing fold below the fixed nav — matches FnoNinjaHero height. */
export const FNO_LANDING_FOLD_CLASS =
  "min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)]";

/** Fallback nav clearance for tour callouts when nav is not mounted yet. */
export const FNO_NAV_CLEARANCE_PX = 72;

/** Breathing room below the fixed nav on full-screen analytics surfaces. */
export const FNO_APP_TOP_GAP_CLASS = "pt-2";

/** Levels/chart main — fills viewport on desktop; grows with content + page scroll on mobile. */
export const FNO_LEVELS_MAIN =
  "flex-1 min-h-0 w-full min-w-0 flex flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden";

/** /levels and /levels/chart — locked viewport on desktop; natural height + page scroll on mobile. */
export const FNO_LEVELS_PAGE_ROOT =
  "min-h-dvh w-full flex flex-col overflow-x-hidden max-md:h-auto max-md:overflow-visible md:h-dvh md:max-h-dvh md:overflow-hidden";

/** Min height for slide auth gate + content on mobile (below nav + toolbar). */
export const FNO_MOBILE_SLIDE_BODY_MIN_CLASS = "max-md:min-h-[calc(100dvh-3.5rem-0.5rem-4.5rem)]";

/** Levels slideshow + bubbles (wide data canvas). */
export const FNO_LEVELS_SHELL =
  "w-full max-w-[100rem] mx-auto px-3 sm:px-5 min-w-0";

export const FNO_CONTENT_SHELL = "max-w-[1100px] mx-auto w-full px-4 sm:px-6";

export const FNO_NARROW_SHELL = "max-w-3xl mx-auto w-full px-4 sm:px-6";
