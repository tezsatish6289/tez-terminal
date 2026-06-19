/** Seconds on each slideshow symbol before auto-advance. */
export const SLIDESHOW_SLIDE_SECONDS = 60;

/** Row height for horizontal symbol tiles + matching square icon controls. */
export const LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS = "h-12 md:h-[4.75rem]";

/** Square filter / play-pause boxes — same height as symbol strip tiles. */
export const LEVELS_STRIP_ICON_BOX_CLASS =
  "h-12 w-12 md:h-[4.75rem] md:w-[4.75rem] shrink-0 rounded-lg";

/** Horizontal scroll for toolbar strips on narrow viewports. */
export const LEVELS_MOBILE_HSTRIP_SCROLL_CLASS =
  "max-md:overflow-x-auto max-md:overscroll-x-contain max-md:touch-pan-x max-md:[-webkit-overflow-scrolling:touch] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden";

/** Bubble map filter row — single horizontal scrollport. */
export const LEVELS_BUBBLE_TOOLBAR_SCROLL_CLASS =
  "shrink-0 mb-2 px-0.5 min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Horizontal scrollport for liveslide/favslide symbol chips (matches SimBotStrip). */
export const LEVELS_SYMBOL_STRIP_SCROLL_CLASS =
  "overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Icon stacked above caption inside strip control boxes. */
export const LEVELS_STRIP_ICON_INNER_CLASS =
  "flex flex-col items-center justify-center gap-1.5";

/** Icon-box caption — max size that fits widest label (BUBBLES) with horizontal padding. */
export const LEVELS_STRIP_BOX_LABEL_CLASS =
  "w-full px-1 text-center text-[10px] md:text-[13px] font-bold leading-none tracking-wide";
