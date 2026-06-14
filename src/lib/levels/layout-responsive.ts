/**
 * Levels chart + news — chart left 60%, news right 40%.
 * Phones: stacked (chart top, news bottom). Tablet+ (640px): side-by-side.
 * Uses standard Tailwind grid-cols-5 / col-span-* (reliable in production builds).
 */

const CHART_NEWS_GRID =
  "grid flex-1 min-h-0 min-w-0 gap-2 sm:gap-3 md:gap-4 grid-cols-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] sm:grid-cols-5 sm:grid-rows-1";

/** Chart + news grid on symbol chart page. */
export const LEVELS_CHART_NEWS_ROW = CHART_NEWS_GRID;

/** Chart cell — left, 3/5 (60%) from sm+. */
export const LEVELS_CHART_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden sm:col-span-3";

/** News cell — right, 2/5 (40%) from sm+. */
export const LEVELS_NEWS_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden sm:col-span-2 sm:border-l sm:border-white/[0.06]";

/** Slideshow: chart + news below strip row. */
export const LEVELS_SLIDESHOW_PANEL_ROW =
  `${CHART_NEWS_GRID} items-stretch pt-2 sm:pt-3 overflow-hidden`;

/** Slideshow chart cell (left 60%). */
export const LEVELS_SLIDESHOW_CHART_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden sm:col-span-3";

/** Slideshow news cell (right 40%). */
export const LEVELS_SLIDESHOW_NEWS_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden sm:col-span-2 sm:border-l sm:border-white/[0.06]";
