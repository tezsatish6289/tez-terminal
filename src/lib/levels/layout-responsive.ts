/**
 * Levels chart + news layout — side-by-side from tablet width up (Tailwind `md`, 768px).
 * Phones stay stacked; iPad portrait/landscape and similar tablets match laptop split.
 */

/** Chart + news row (stacked below md, 70/30 side-by-side from md). */
export const LEVELS_CHART_NEWS_ROW =
  "flex flex-col md:flex-row flex-1 min-h-0 gap-2 sm:gap-3 md:gap-4";

/** Primary chart column — grows in stacked mode; 70% width from md. */
export const LEVELS_CHART_COLUMN =
  "flex flex-col flex-1 min-h-[min(52dvh,440px)] md:min-h-0 min-w-0 w-full md:flex-[7]";

/** News rail — capped height when stacked; 30% width from md. */
export const LEVELS_NEWS_COLUMN =
  "flex flex-col min-h-0 h-full min-w-0 w-full max-h-[min(38dvh,320px)] md:max-h-none md:flex-[3]";

/** Vertical divider between chart and news (tablet+). */
export const LEVELS_SPLIT_DIVIDER = "hidden md:block w-px shrink-0 self-stretch";

/** Slideshow shell: chart + news row with top border padding. */
export const LEVELS_SLIDESHOW_PANEL_ROW =
  "flex flex-col md:flex-row flex-1 min-h-0 gap-2 sm:gap-3 md:gap-4 items-stretch pt-2 sm:pt-3 overflow-hidden min-w-0";

/** Slideshow chart area min-height when stacked (removed at md+). */
export const LEVELS_SLIDESHOW_CHART_MIN =
  "min-h-[min(52dvh,440px)] md:min-h-0";

/** Slideshow news area when stacked (flex share below md; 30% column from md). */
export const LEVELS_SLIDESHOW_NEWS_MIN =
  "flex-1 min-h-[12rem] max-h-[min(38dvh,320px)] md:min-h-0 md:max-h-none";
