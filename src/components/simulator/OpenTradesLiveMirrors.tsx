"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/firebase";
import type {
  ExchangeMirrorSummary,
  LiveMirrorTrade,
} from "@/lib/admin/live-mirror-display";
import { isAdminEmail } from "@/lib/admin-emails-client";
import { cn } from "@/lib/utils";
import { ChevronRight, Loader2 } from "lucide-react";

export function useOpenTradesMirrors(simTradeIds: string[], enabled: boolean) {
  const { user } = useUser();
  const isAdmin = isAdminEmail(user?.email);
  const [mirrorsBySimTradeId, setMirrorsBySimTradeId] = useState<
    Record<string, LiveMirrorTrade[]>
  >({});
  const [exchangeSummary, setExchangeSummary] = useState<ExchangeMirrorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMirrors = useCallback(async () => {
    if (!user || !isAdmin || !enabled || simTradeIds.length === 0) {
      setMirrorsBySimTradeId({});
      setExchangeSummary([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const q = encodeURIComponent(simTradeIds.join(","));
      const res = await fetch(`/api/admin/sim-open-trades/mirrors?simTradeIds=${q}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMirrorsBySimTradeId(data.mirrorsBySimTradeId ?? {});
      setExchangeSummary(data.exchangeSummary ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load live mirrors");
      setMirrorsBySimTradeId({});
      setExchangeSummary([]);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, enabled, simTradeIds]);

  useEffect(() => {
    void fetchMirrors();
  }, [fetchMirrors]);

  return {
    isAdmin,
    mirrorsBySimTradeId,
    exchangeSummary,
    loading,
    error,
    refetch: fetchMirrors,
  };
}

/** Exchange pills — opens full-page view for that exchange. */
export function LiveMirrorExchangeBar({
  exchangeSummary,
  loading,
  error,
  simTradeIds,
}: {
  exchangeSummary: ExchangeMirrorSummary[];
  loading: boolean;
  error: string | null;
  simTradeIds: string[];
}) {
  const idsQuery = encodeURIComponent(simTradeIds.join(","));

  if (error) {
    return (
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
        Live mirrors: {error}
      </div>
    );
  }

  if (loading && exchangeSummary.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 px-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading live exchange mirrors…
      </div>
    );
  }

  if (exchangeSummary.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground/40 px-1">
        No live mirrored positions on exchanges for these open sim trades.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
          Live on exchange
        </span>
        {exchangeSummary.map((ex) => (
          <Link
            key={ex.exchange}
            href={`/simulation/mirrors/exchange/${encodeURIComponent(ex.exchange)}?simTradeIds=${idsQuery}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.03] text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-accent hover:border-accent/30 transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
            {ex.exchange}
            <span className="font-mono text-emerald-400">{ex.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Clickable badge on open cards — opens per-trade live user mirror list. */
export function LiveMirrorSymbolLink({
  simTradeId,
  mirrorCount,
}: {
  simTradeId: string;
  mirrorCount: number;
}) {
  if (!simTradeId) return null;

  return (
    <Link
      href={`/simulation/mirrors/${simTradeId}`}
      onClick={(e) => e.stopPropagation()}
      title="Live user trades mirrored to exchanges for this signal"
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] font-mono font-bold mt-0.5",
        mirrorCount > 0
          ? "text-accent/80 hover:text-accent"
          : "text-muted-foreground/45 hover:text-muted-foreground/70",
      )}
    >
      {mirrorCount} live user{mirrorCount === 1 ? "" : "s"}
      <ChevronRight className="h-2.5 w-2.5" />
    </Link>
  );
}
