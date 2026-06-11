"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/firebase";
import { normalizeFavslideSymbol } from "@/lib/fnoninja/favslide";

export function useFnoNinjaFavslide(enabled: boolean) {
  const { user, isUserLoading } = useUser();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setSymbols([]);
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
      setSymbols(Array.isArray(data.symbols) ? data.symbols : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load favslide");
      setSymbols([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    if (isUserLoading) return;
    void refresh();
  }, [isUserLoading, refresh]);

  const setFavorite = useCallback(
    async (rawSymbol: string, favorited: boolean) => {
      const symbol = normalizeFavslideSymbol(rawSymbol);
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
          body: JSON.stringify({ symbol, action: favorited ? "add" : "remove" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to update favslide");
        const next = Array.isArray(data.symbols) ? data.symbols : [];
        setSymbols(next);
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
    async (rawSymbol: string) => {
      const symbol = normalizeFavslideSymbol(rawSymbol);
      if (!symbol) return false;
      const favorited = !symbols.includes(symbol);
      return setFavorite(symbol, favorited);
    },
    [setFavorite, symbols],
  );

  const favoriteSet = useMemo(() => new Set(symbols), [symbols]);

  const isFavorite = useCallback((rawSymbol: string) => {
    const symbol = normalizeFavslideSymbol(rawSymbol);
    return symbol != null && favoriteSet.has(symbol);
  }, [favoriteSet]);

  return {
    symbols,
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
