"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  ShieldAlert,
  Search,
  Download,
  RefreshCw,
  ListChecks,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type {
  WatchlistBuildResult,
  WatchlistListId,
  WatchlistSymbolRow,
} from "@/lib/watchlist/build-watchlists";
import { WATCHLIST_TV_CHART_EXCHANGE, WATCHLIST_TV_MAX_SYMBOLS } from "@/lib/watchlist/venues";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

function downloadTxt(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function IdealWatchlistAdminPage() {
  const { user, isUserLoading: authLoading } = useUser();
  const [data, setData] = useState<WatchlistBuildResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<WatchlistListId | "all">("core");
  const [coreOnly, setCoreOnly] = useState(true);

  const isAdmin = user?.email && ADMIN_EMAILS.has(user.email);

  const fetchData = useCallback(
    async (refresh = false) => {
      if (!user) return;
      setLoading(true);
      setError("");
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/admin/watchlist${refresh ? "?refresh=1" : ""}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        setData(json as WatchlistBuildResult);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unexpected error");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (isAdmin) void fetchData();
  }, [isAdmin, fetchData]);

  const activeVenues = data?.activeVenueKeys ?? [];

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows: WatchlistSymbolRow[] = data.rows;
    if (listFilter === "core") rows = rows.filter((r) => r.inCore);
    else if (listFilter === "bybit_only")
      rows = rows.filter((r) => r.venues.BYBIT && !r.inCore);
    if (coreOnly && listFilter === "all") rows = rows.filter((r) => r.inCore);
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.symbol.toLowerCase().includes(q));
    return rows;
  }, [data, listFilter, coreOnly, query]);

  const handleDownload = (listId: WatchlistListId, partIndex = 0) => {
    if (!data) return;
    const parts = data.downloads[listId];
    const content = parts[partIndex];
    if (!content) return;
    const suffix = parts.length > 1 ? `-part${partIndex + 1}` : "";
    const stamp = format(new Date(data.generatedAt), "yyyyMMdd");
    downloadTxt(`tez-${listId}${suffix}-bybit-tv-${stamp}.txt`, content);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <ShieldAlert className="h-10 w-10" />
        <p className="text-sm font-medium">Admin access required</p>
      </div>
    );
  }

  const coreMeta = data?.lists.find((l) => l.id === "core");

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="max-w-7xl mx-auto px-4 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-blue-400" />
              Ideal Watchlist
            </h1>
            <p className="text-xs text-muted-foreground/50 mt-0.5 max-w-2xl">
              Multi-venue USDT perpetuals → TradingView upload as {WATCHLIST_TV_CHART_EXCHANGE}:COINUSDT.P
              (max {WATCHLIST_TV_MAX_SYMBOLS} per file). Core = listed on every active venue below.
            </p>
            {data?.generatedAt && (
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Last built {format(new Date(data.generatedAt), "MMM d, yyyy HH:mm")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void fetchData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-white transition-colors border border-white/10 hover:border-white/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh from exchanges
          </button>
        </div>

        {/* Exchanges covered — update venues.ts when integrating new venues */}
        <section
          className="rounded-xl p-4 mb-5 border border-amber-500/20 bg-amber-500/5"
          aria-labelledby="venues-covered-heading"
        >
          <h2 id="venues-covered-heading" className="text-xs font-bold uppercase tracking-widest text-amber-200/90 mb-2">
            Exchanges covered
          </h2>
          <p className="text-[11px] text-muted-foreground mb-3">
            After you integrate a new venue, add it in{" "}
            <code className="text-amber-100/80">src/lib/watchlist/venues.ts</code> and set{" "}
            <code className="text-amber-100/80">status: &quot;active&quot;</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            {(data?.venues ?? []).map((v) => {
              const count = data?.venueCounts[v.key];
              const err = data?.venueErrors[v.key];
              const isActive = v.status === "active";
              return (
                <div
                  key={v.key}
                  className={`px-3 py-2 rounded-lg border text-left min-w-[140px] ${
                    isActive
                      ? "border-white/10 bg-white/[0.03]"
                      : "border-dashed border-white/10 bg-transparent opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{v.label}</span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-muted-foreground"
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{v.key}</p>
                  {isActive && count != null && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{count} symbols</p>
                  )}
                  {err && (
                    <p className="text-[10px] text-rose-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {err.slice(0, 80)}
                    </p>
                  )}
                  {v.notes && (
                    <p className="text-[10px] text-muted-foreground/50 mt-1 leading-snug">{v.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {data.lists.map((list) => (
                <div
                  key={list.id}
                  className="rounded-xl p-4 border border-white/10 bg-card/50"
                >
                  <p className="text-sm font-bold text-white">{list.label}</p>
                  <p className="text-2xl font-black text-blue-400 mt-1">{list.count}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{list.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {data.downloads[list.id].map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleDownload(list.id, i)}
                        disabled={list.count === 0}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
                      >
                        <Download className="h-3 w-3" />
                        TV .txt{data.downloads[list.id].length > 1 ? ` part ${i + 1}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {(
                [
                  { id: "core" as const, label: `Core (${coreMeta?.count ?? 0})` },
                  { id: "union" as const, label: `Union (${data.lists.find((l) => l.id === "union")?.count ?? 0})` },
                  {
                    id: "bybit_only" as const,
                    label: `Bybit only (${data.lists.find((l) => l.id === "bybit_only")?.count ?? 0})`,
                  },
                  { id: "all" as const, label: "All rows" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setListFilter(tab.id);
                    setCoreOnly(tab.id === "all");
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                    listFilter === tab.id
                      ? "bg-blue-600 text-white"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4 border border-border"
              style={{ backgroundColor: "hsl(var(--card))" }}
            >
              <Search className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              <input
                type="text"
                placeholder="Search symbol…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground/40 outline-none"
              />
            </div>

            {loading && !data.rows.length ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="px-3 py-2 font-bold text-muted-foreground">Symbol</th>
                      <th className="px-3 py-2 font-bold text-muted-foreground">Core</th>
                      {activeVenues.map((k) => (
                        <th key={k} className="px-3 py-2 font-bold text-muted-foreground">
                          {data.venues.find((v) => v.key === k)?.label ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 500).map((row) => (
                      <tr key={row.symbol} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-3 py-1.5 font-mono text-white">{row.symbol}</td>
                        <td className="px-3 py-1.5">
                          {row.inCore ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-muted-foreground/30" />
                          )}
                        </td>
                        {activeVenues.map((k) => (
                          <td key={k} className="px-3 py-1.5">
                            {row.venues[k] ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400/80" />
                            ) : (
                              <span className="text-muted-foreground/20">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length > 500 && (
                  <p className="text-[10px] text-muted-foreground px-3 py-2">
                    Showing first 500 of {filteredRows.length} — narrow search to see more.
                  </p>
                )}
                {filteredRows.length === 0 && (
                  <p className="text-sm text-muted-foreground px-3 py-8 text-center">No symbols match filters.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
