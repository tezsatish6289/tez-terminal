"use client";

import { Loader2, Star } from "lucide-react";
import {
  useFnoNinjaFavslide,
  type FnoNinjaFavslideApi,
} from "@/hooks/useFnoNinjaFavslide";
import { FNO_FAVSLIDE_CHIP, FNO_MUTED } from "@/lib/fnoninja/theme";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export function FnoNinjaFavslideToggle({
  scope,
  symbol,
  enabled,
  /** Favslide slideshow — always remove, always amber theme. */
  removeOnly = false,
  /** Icon-only trigger — favslide / liveslide header. */
  iconOnly = false,
  /** Parent hook — keeps list in sync when toggling from /levels favslide. */
  api: externalApi,
}: {
  scope: LevelsTvScope;
  symbol: string;
  enabled: boolean;
  removeOnly?: boolean;
  iconOnly?: boolean;
  api?: FnoNinjaFavslideApi;
}) {
  const internal = useFnoNinjaFavslide(enabled && !externalApi);
  const api = externalApi ?? internal;
  const favorited = removeOnly || api.isFavorite(scope, symbol);

  if (!enabled) return null;

  const needsSignIn = !externalApi && !internal.isSignedIn;
  const busy = api.loading || api.mutating;
  const error = externalApi ? null : internal.error;
  const amber = favorited || removeOnly;

  const handleClick = () => {
    if (needsSignIn) return;
    if (removeOnly) void api.setFavorite(scope, symbol, false);
    else void api.toggle(scope, symbol);
  };

  return (
    <button
      type="button"
      disabled={busy || needsSignIn}
      onClick={handleClick}
      className={
        iconOnly
          ? "inline-flex items-center justify-center h-8 w-8 rounded-full transition-all hover:scale-[1.06] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          : "inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      }
      style={{
        color: amber ? FNO_FAVSLIDE_CHIP.text : FNO_MUTED,
        backgroundColor: amber ? FNO_FAVSLIDE_CHIP.fillActive : "rgba(255,255,255,0.04)",
        border: `1px solid ${amber ? FNO_FAVSLIDE_CHIP.borderActive : "rgba(148,163,184,0.22)"}`,
        boxShadow: amber ? "0 0 14px rgba(251,191,36,0.2)" : undefined,
      }}
      title={
        needsSignIn
          ? "Sign in to use favslide"
          : error
            ? error
            : favorited
              ? "Remove from favslide"
              : "Add to favslide"
      }
      aria-label={
        favorited
          ? `Remove ${symbol} from favslide`
          : `Add ${symbol} to favslide`
      }
      data-favslide-tour={removeOnly ? "remove" : undefined}
    >
      {busy ? (
        <Loader2
          className={iconOnly ? "h-4 w-4 animate-spin shrink-0" : "h-3.5 w-3.5 animate-spin shrink-0"}
          style={{ color: amber ? FNO_FAVSLIDE_CHIP.text : FNO_MUTED }}
        />
      ) : (
        <Star
          className={iconOnly ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"}
          style={{ color: amber ? FNO_FAVSLIDE_CHIP.text : FNO_MUTED }}
          fill={amber ? FNO_FAVSLIDE_CHIP.text : "none"}
          strokeWidth={2}
        />
      )}
      {!iconOnly ? (
        <span className="whitespace-nowrap">
          {favorited ? "Remove from favslide" : "Add to favslide"}
        </span>
      ) : null}
    </button>
  );
}
