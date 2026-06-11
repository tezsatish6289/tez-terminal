"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/firebase";
import {
  favslideEntryKey,
  parseFavslideEntries,
  type FavslideEntry,
} from "@/lib/fnoninja/favslide";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

export type FnoNinjaFavslideApi = {
  isFavorite: (scope: LevelsTvScope, rawSymbol: string) => boolean;
  setFavorite: (
    scope: LevelsTvScope,
    rawSymbol: string,
    favorited: boolean,
  ) => Promise<boolean>;
  toggle: (scope: LevelsTvScope, rawSymbol: string) => Promise<boolean>;
  loading: boolean;
  mutating: boolean;
};

export function useFnoNinjaFavslide(enabled: boolean) {
  const { user, isUserLoading } = useUser();
  const [entries, setEntries] = useState<FavslideEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setEntries([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/fnoninja/favslide", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load favslide");
      setEntries(parseFavslideEntries(data.entries ?? data.symbols));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load favslide");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    if (isUserLoading) return;
    void refresh();
  }, [isUserLoading, refresh]);

  const setFavorite = useCallback(
    async (scope: LevelsTvScope, rawSymbol: string, favorited: boolean) => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!enabled || !user || !symbol) return false;
      setMutating(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/fnoninja/favslide", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            symbol,
            scope,
            action: favorited ? "add" : "remove",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to update favslide");
        setEntries(parseFavslideEntries(data.entries ?? data.symbols));
        return Boolean(data.favorited);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to update favslide");
        return false;
      } finally {
        setMutating(false);
      }
    },
    [enabled, user],
  );

  const toggle = useCallback(
    async (scope: LevelsTvScope, rawSymbol: string) => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol) return false;
      const favorited = !isFavoriteInList(entries, scope, symbol);
      return setFavorite(scope, symbol, favorited);
    },
    [entries, setFavorite],
  );

  const favoriteSet = useMemo(
    () => new Set(entries.map(favslideEntryKey)),
    [entries],
  );

  const isFavorite = useCallback(
    (scope: LevelsTvScope, rawSymbol: string) => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol) return false;
      return favoriteSet.has(favslideEntryKey({ scope, symbol }));
    },
    [favoriteSet],
  );

  return {
    entries,
    symbols: entries.map(favslideEntryKey),
    loading: loading || isUserLoading,
    mutating,
    error,
    refresh,
    setFavorite,
    toggle,
    isFavorite,
    isSignedIn: Boolean(user),
  };
}

function isFavoriteInList(
  entries: FavslideEntry[],
  scope: LevelsTvScope,
  symbol: string,
): boolean {
  return entries.some((e) => e.scope === scope && e.symbol === symbol);
}
