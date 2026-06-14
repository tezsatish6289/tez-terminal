/**
 * Levels chart + news layout — 70% chart : 30% news via CSS grid (not flex content sizing).
 * Stacked on phones; side-by-side from tablet (Tailwind `md`, 768px).
 */

/** Chart + news grid — fills remaining viewport below chrome. */
export const LEVELS_CHART_NEWS_ROW =
  "grid flex-1 min-h-0 min-w-0 gap-2 sm:gap-3 md:gap-4 grid-cols-1 grid-rows-[minmax(0,7fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] md:grid-rows-1";

/** Chart cell — grid assigns ~70% width (md+) or height (phone). */
export const LEVELS_CHART_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden";

/** News cell — grid assigns ~30% width (md+) or height (phone). */
export const LEVELS_NEWS_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden md:border-l md:border-white/[0.06]";

/** Slideshow shell: chart + news below strip row. */
export const LEVELS_SLIDESHOW_PANEL_ROW =
  "grid flex-1 min-h-0 min-w-0 gap-2 sm:gap-3 md:gap-4 items-stretch pt-2 sm:pt-3 overflow-hidden grid-cols-1 grid-rows-[minmax(0,7fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] md:grid-rows-1";

/** Slideshow chart cell (~70%). */
export const LEVELS_SLIDESHOW_CHART_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden";

/** Slideshow news cell (~30%). */
export const LEVELS_SLIDESHOW_NEWS_COLUMN =
  "flex flex-col min-h-0 min-w-0 h-full overflow-hidden md:border-l md:border-white/[0.06]";
