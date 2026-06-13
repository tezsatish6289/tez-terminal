/** Layout tokens for fnoninja.com marketing pages. */
export const FNO_PAGE_ROOT =
  "min-h-dvh w-full overflow-x-hidden flex flex-col";

/** Must match fixed nav outer height (FNO_NAV_HEIGHT_CLASS with box-border). */
export const FNO_NAV_SPACER_CLASS = "h-14 sm:h-16";

/** Fallback nav clearance for tour callouts when nav is not mounted yet. */
export const FNO_NAV_CLEARANCE_PX = 72;

/** Breathing room below the fixed nav on full-screen analytics surfaces. */
export const FNO_APP_TOP_GAP_CLASS = "pt-2";

/** Levels/chart main — fills the flex viewport below nav (used with FNO_LEVELS_PAGE_ROOT). */
export const FNO_LEVELS_MAIN =
  "flex-1 min-h-0 w-full min-w-0 overflow-hidden flex flex-col";

/** /levels and /levels/chart — lock to viewport height (footer hidden). */
export const FNO_LEVELS_PAGE_ROOT =
  "h-dvh max-h-dvh overflow-hidden w-full flex flex-col";

export const FNO_CONTENT_SHELL = "max-w-[1100px] mx-auto w-full px-4 sm:px-6";

export const FNO_NARROW_SHELL = "max-w-3xl mx-auto w-full px-4 sm:px-6";
