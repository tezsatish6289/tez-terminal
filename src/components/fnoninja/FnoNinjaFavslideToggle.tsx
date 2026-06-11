"use client";

import { Loader2, Star } from "lucide-react";
import { useFnoNinjaFavslide } from "@/hooks/useFnoNinjaFavslide";
import { FNO_FAVSLIDE_CHIP, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaFavslideToggle({
  symbol,
  enabled,
  /** Favslide slideshow — always remove, always amber theme. */
  removeOnly = false,
}: {
  symbol: string;
  enabled: boolean;
  removeOnly?: boolean;
}) {
  const { isFavorite, toggle, mutating, loading } = useFnoNinjaFavslide(enabled);
  const favorited = removeOnly || isFavorite(symbol);

  if (!enabled) return null;

  const busy = loading || mutating;
  const amber = favorited || removeOnly;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void toggle(symbol)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      style={{
        color: amber ? FNO_FAVSLIDE_CHIP.text : FNO_MUTED,
        backgroundColor: amber ? FNO_FAVSLIDE_CHIP.fillActive : "rgba(255,255,255,0.04)",
        border: `1px solid ${amber ? FNO_FAVSLIDE_CHIP.borderActive : "rgba(148,163,184,0.22)"}`,
        boxShadow: amber ? "0 0 12px rgba(251,191,36,0.12)" : undefined,
      }}
      title={favorited ? "Remove from favslide" : "Add to favslide"}
      aria-label={favorited ? `Remove ${symbol} from favslide` : `Add ${symbol} to favslide`}
    >
      {busy ? (
        <Loader2
          className="h-3.5 w-3.5 animate-spin shrink-0"
          style={{ color: amber ? FNO_FAVSLIDE_CHIP.text : FNO_MUTED }}
        />
      ) : (
        <Star
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: amber ? FNO_FAVSLIDE_CHIP.text : FNO_MUTED }}
          fill={amber ? FNO_FAVSLIDE_CHIP.text : "none"}
          strokeWidth={2}
        />
      )}
      <span className="whitespace-nowrap">
        {favorited ? "Remove from favslide" : "Add to favslide"}
      </span>
    </button>
  );
}
