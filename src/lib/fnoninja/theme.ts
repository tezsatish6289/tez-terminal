/** FNONINJA blue brand tokens (FreedomBot-aligned). */
export const FNO_BG = "#080f1e";
/** Analytics canvas — harmonized with shell, slightly deeper for data views. */
export const FNO_BG_CANVAS = "#070d1a";
export const FNO_TEXT = "#f0f4ff";
export const FNO_MUTED = "#64748b";
export const FNO_CARD_BG = "#0d1b2e";
export const FNO_CARD_BORDER = "1px solid rgba(90,140,220,0.2)";
export const FNO_NAV_BORDER = "rgba(90,140,220,0.1)";
export const FNO_ACCENT = "#60a5fa";
/** Liveslide slideshow — live aligned setups (brand blue). */
export const FNO_LIVESLIDE_ACCENT = "#60a5fa";
/** Favslide slideshow — personal watchlist (amber star). */
export const FNO_FAVSLIDE_ACCENT = "#fbbf24";
export const FNO_FAVSLIDE_CHALK = "#fcd34d";
/** Chip / CTA styling — matches LevelsSlideshowCta favslide variant. */
export const FNO_FAVSLIDE_CHIP = {
  text: FNO_FAVSLIDE_CHALK,
  fill: "rgba(251,191,36,0.12)",
  fillActive: "rgba(251,191,36,0.18)",
  border: "rgba(251,191,36,0.38)",
  borderActive: "rgba(251,191,36,0.52)",
} as const;
export const FNO_FAVSLIDE_WASH =
  "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(251,191,36,0.07), transparent)";
export const FNO_LOGO_MARK = "#3b82f6";
export const FNO_ACCENT_SOFT = "rgba(37,99,235,0.08)";
export const FNO_GRADIENT_TEXT =
  "linear-gradient(135deg, #3b82f6 0%, #60a5fa 60%, #93c5fd 100%)";
export const FNO_CTA_GRADIENT = "linear-gradient(135deg, #1d4ed8, #3b82f6)";
export const FNO_CTA_SHADOW = "0 6px 20px rgba(59,130,246,0.4)";

/** Soft blue radial glow — no grid lines. */
export const FNO_BG_GLOW =
  "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.12), transparent)";

/** Full-bleed levels / chart page: soft blue glow + faint grid. */
export const FNO_BG_TEXTURE = `
  ${FNO_BG_GLOW},
  linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
`;
export const FNO_BG_TEXTURE_SIZE = "100% 100%, 48px 48px, 48px 48px";

/** Bubble map card — same language, glow centered on the map. */
export const FNO_BUBBLE_MAP_TEXTURE = `
  radial-gradient(ellipse 75% 60% at 50% 42%, rgba(37,99,235,0.1), transparent),
  linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)
`;
export const FNO_BUBBLE_MAP_TEXTURE_SIZE = "100% 100%, 44px 44px, 44px 44px";

/** Landing hero — whisper grid so home matches the analytics surface. */
export const FNO_HERO_TEXTURE = `
  linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)
`;
export const FNO_HERO_TEXTURE_SIZE = "48px 48px, 48px 48px";

/** Shared inline style for levels + chart full-viewport mains (glow only, no grid). */
export const FNO_APP_SURFACE_STYLE = {
  backgroundColor: FNO_BG_CANVAS,
  backgroundImage: FNO_BG_GLOW,
  backgroundSize: "100% 100%",
} as const;

export const FNO_BUBBLE_MAP_SURFACE_STYLE = {
  backgroundColor: FNO_BG_CANVAS,
  backgroundImage: FNO_BUBBLE_MAP_TEXTURE,
  backgroundSize: FNO_BUBBLE_MAP_TEXTURE_SIZE,
} as const;
