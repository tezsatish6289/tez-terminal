/** Layout tokens for fnoninja.com marketing pages. */
export const FNO_PAGE_ROOT =
  "min-h-dvh w-full overflow-x-hidden flex flex-col";

/** Must match fixed nav outer height (FNO_NAV_HEIGHT_CLASS with box-border). */
export const FNO_NAV_SPACER_CLASS = "h-14 sm:h-16";

/** Fallback nav clearance for tour callouts when nav is not mounted yet. */
export const FNO_NAV_CLEARANCE_PX = 72;

/** Breathing room below the fixed nav on full-screen analytics surfaces. */
export const FNO_APP_TOP_GAP_CLASS = "pt-2";

/** Levels/chart main — fills viewport on desktop; grows with content on mobile (bubbles). */
export const FNO_LEVELS_MAIN =
  "flex-1 min-h-0 w-full min-w-0 flex flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden";

/** Liveslide/favslide on mobile — locked height below nav for internal chart+news scroll. */
export const FNO_LEVELS_SLIDE_MAIN =
  "flex-1 min-h-0 w-full min-w-0 flex flex-col max-md:h-[calc(100dvh-3.5rem-0.5rem)] max-md:max-h-[calc(100dvh-3.5rem-0.5rem)] max-md:overflow-hidden md:overflow-hidden";

/** /levels and /levels/chart — locked viewport on desktop; natural height on mobile. */
export const FNO_LEVELS_PAGE_ROOT =
  "min-h-dvh w-full flex flex-col overflow-x-hidden max-md:h-auto max-md:overflow-visible md:h-dvh md:max-h-dvh md:overflow-hidden";

/** Mobile liveslide/favslide workspace — toolbar row + scrollport below. */
export const FNO_MOBILE_SLIDE_WORKSPACE_CLASS =
  "flex flex-col flex-1 min-h-0 w-full min-w-0 max-md:grid max-md:grid-rows-[auto_minmax(0,1fr)] max-md:overflow-hidden md:overflow-hidden";

/** Scrollport for chart + news below the slideshow toolbar on mobile. */
export const FNO_MOBILE_SLIDE_SCROLL_CLASS =
  "flex min-h-0 w-full min-w-0 flex-col max-md:overflow-y-auto max-md:overscroll-y-contain max-md:touch-pan-y max-md:[-webkit-overflow-scrolling:touch] md:flex-1 md:overflow-hidden";

/** Min height for slide auth gate + scroll content on mobile (below nav + toolbar). */
export const FNO_MOBILE_SLIDE_BODY_MIN_CLASS = "max-md:min-h-[calc(100dvh-3.5rem-0.5rem-4.5rem)]";

export const FNO_CONTENT_SHELL = "max-w-[1100px] mx-auto w-full px-4 sm:px-6";

export const FNO_NARROW_SHELL = "max-w-3xl mx-auto w-full px-4 sm:px-6";
