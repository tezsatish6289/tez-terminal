"use client";

import { Loader2, Star } from "lucide-react";
import { useFnoNinjaFavslide } from "@/hooks/useFnoNinjaFavslide";
import { FNO_FAVSLIDE_ACCENT, FNO_MUTED } from "@/lib/fnoninja/theme";

export function FnoNinjaFavslideToggle({
  symbol,
  enabled,
}: {
  symbol: string;
  enabled: boolean;
}) {
  const { isFavorite, toggle, mutating, loading } = useFnoNinjaFavslide(enabled);
  const favorited = isFavorite(symbol);

  if (!enabled) return null;

  const busy = loading || mutating;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void toggle(symbol)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      style={{
        color: favorited ? FNO_FAVSLIDE_ACCENT : FNO_MUTED,
        backgroundColor: favorited ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${favorited ? "rgba(251,191,36,0.38)" : "rgba(90,140,220,0.15)"}`,
      }}
      title={favorited ? "Remove from favslide" : "Add to favslide"}
      aria-label={favorited ? `Remove ${symbol} from favslide` : `Add ${symbol} to favslide`}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
      ) : (
        <Star
          className="h-3.5 w-3.5 shrink-0"
          fill={favorited ? "currentColor" : "none"}
          strokeWidth={2}
        />
      )}
      <span className="whitespace-nowrap">{favorited ? "Remove from favslide" : "Add to favslide"}</span>
    </button>
  );
}
