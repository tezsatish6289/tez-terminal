/**
 * Levels chart + news layout — proportional to viewport, not fixed pixels.
 * Side-by-side from tablet width up (Tailwind `md`, 768px); stacked on phones.
 * Chart : news ≈ 7 : 3 in both orientations via flex-grow.
 */

/** Chart + news row — fills remaining viewport height below chrome. */
export const LEVELS_CHART_NEWS_ROW =
  "flex flex-col md:flex-row flex-1 min-h-0 gap-2 sm:gap-3 md:gap-4";

/** Primary chart column (~70% of row height or width). */
export const LEVELS_CHART_COLUMN =
  "flex flex-col flex-[7] min-h-0 min-w-0 w-full";

/** News rail (~30% of row height or width). */
export const LEVELS_NEWS_COLUMN =
  "flex flex-col flex-[3] min-h-0 min-w-0 w-full h-full";

/** Vertical divider between chart and news (tablet+). */
export const LEVELS_SPLIT_DIVIDER = "hidden md:block w-px shrink-0 self-stretch";

/** Slideshow shell: chart + news row with top border padding. */
export const LEVELS_SLIDESHOW_PANEL_ROW =
  "flex flex-col md:flex-row flex-1 min-h-0 gap-2 sm:gap-3 md:gap-4 items-stretch pt-2 sm:pt-3 overflow-hidden min-w-0";

/** Slideshow chart column wrapper (~70%). */
export const LEVELS_SLIDESHOW_CHART_COLUMN =
  "flex flex-col flex-[7] min-h-0 min-w-0 w-full";

/** Slideshow news column wrapper (~30%). */
export const LEVELS_SLIDESHOW_NEWS_COLUMN =
  "flex flex-col flex-[3] min-h-0 min-w-0 w-full h-full";
