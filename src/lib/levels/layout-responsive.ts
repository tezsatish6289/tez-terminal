/**
 * Levels chart + news — chart left 60%, news right 40%, full viewport width.
 * Phones: stacked (chart top 60%, news bottom 40%). Tablet+ (640px): side-by-side.
 * Uses built-in w-3/5 / w-2/5 (always in Tailwind bundle — no col-span purge issues).
 */

const CHART_NEWS_ROW =
  "flex flex-col sm:flex-row flex-1 min-h-0 min-w-0 w-full gap-2 sm:gap-3 md:gap-4";

/** Chart + news row on symbol chart page. */
export const LEVELS_CHART_NEWS_ROW = CHART_NEWS_ROW;

/** Chart panel — left 60% (sm+), top 60% height when stacked. */
export const LEVELS_CHART_COLUMN =
  "flex flex-col flex-[3] sm:flex-none min-h-0 min-w-0 w-full sm:w-3/5 h-full overflow-hidden";

/** News panel — right 40% (sm+), bottom 40% height when stacked. */
export const LEVELS_NEWS_COLUMN =
  "flex flex-col flex-[2] sm:flex-none min-h-0 min-w-0 w-full sm:w-2/5 h-full overflow-hidden sm:border-l sm:border-white/[0.06]";

/** Slideshow: chart + news below strip row. */
export const LEVELS_SLIDESHOW_PANEL_ROW =
  `${CHART_NEWS_ROW} items-stretch pt-2 sm:pt-3 overflow-hidden`;

/** Slideshow chart panel (left 60%). */
export const LEVELS_SLIDESHOW_CHART_COLUMN =
  "flex flex-col flex-[3] sm:flex-none min-h-0 min-w-0 w-full sm:w-3/5 h-full overflow-hidden";

/** Slideshow news panel (right 40%). */
export const LEVELS_SLIDESHOW_NEWS_COLUMN =
  "flex flex-col flex-[2] sm:flex-none min-h-0 min-w-0 w-full sm:w-2/5 h-full overflow-hidden sm:border-l sm:border-white/[0.06]";
