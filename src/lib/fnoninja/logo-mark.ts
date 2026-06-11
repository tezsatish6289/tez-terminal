/** Shared FNONINJA logo-mark geometry — keep public/fnoninja/icon.svg in sync. */
export const FNO_LOGO_MARK_VIEWBOX = 32;
export const FNO_LOGO_MARK_RX = 8;

/** Matches FnoNinjaLogo: inner SVG is 42% of box; diamond rect is 7.5/12 of that SVG. */
export const FNO_LOGO_DIAMOND_SIDE = FNO_LOGO_MARK_VIEWBOX * 0.42 * (7.5 / 12);
export const FNO_LOGO_DIAMOND_RX = 0.5 * (FNO_LOGO_DIAMOND_SIDE / 7.5);

export const FNO_LOGO_DIAMOND_ORIGIN =
  FNO_LOGO_MARK_VIEWBOX / 2 - FNO_LOGO_DIAMOND_SIDE / 2;
