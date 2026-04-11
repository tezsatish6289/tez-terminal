"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  ShieldAlert,
  Search,
  Download,
  Users,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  mobile: string;
  country: string;
  assetTypes: string[];
  source: string;
  joinedAt: string | null;
}

const ASSET_COLORS: Record<string, { bg: string; text: string }> = {
  Crypto:      { bg: "bg-yellow-500/10", text: "text-yellow-400" },
  IndianStock: { bg: "bg-orange-500/10", text: "text-orange-400" },
  Gold:        { bg: "bg-amber-500/10",  text: "text-amber-300" },
  Silver:      { bg: "bg-slate-500/10",  text: "text-slate-300" },
  Commodities: { bg: "bg-teal-500/10",   text: "text-teal-400" },
};

function AssetBadge({ type }: { type: string }) {
  const c = ASSET_COLORS[type] ?? { bg: "bg-white/5", text: "text-slate-400" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${c.bg} ${c.text}`}>
      {type === "IndianStock" ? "IN Stock" : type}
    </span>
  );
}

function downloadCSV(entries: WaitlistEntry[]) {
  const headers = ["Name", "Email", "Mobile", "Country", "Asset Types", "Source", "Joined At"];
  const rows = entries.map((e) => [
    e.name,
    e.email,
    e.mobile,
    e.country,
    e.assetTypes.join("; "),
    e.source,
    e.joinedAt ? format(new Date(e.joinedAt), "yyyy-MM-dd HH:mm") : "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `waitlist_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WaitlistAdminPage() {
  const { user, loading: authLoading } = useUser();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [query,   setQuery]   = useState("");
  const [assetFilter, setAssetFilter] = useState<string>("all");

  const isAdmin = user?.email && ADMIN_EMAILS.has(user.email);

  const fetchEntries = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/waitlist", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setEntries(data.entries);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const allAssets = useMemo(() => {
    const s = new Set<string>();
    entries.forEach((e) => e.assetTypes.forEach((a) => s.add(a)));
    return Array.from(s).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return entries.filter((e) => {
      const matchQ = !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.country.toLowerCase().includes(q);
      const matchA = assetFilter === "all" || e.assetTypes.includes(assetFilter);
      return matchQ && matchA;
    });
  }, [entries, query, assetFilter]);

  // Asset type summary counts
  const assetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach((e) => e.assetTypes.forEach((a) => { counts[a] = (counts[a] ?? 0) + 1; }));
    return counts;
  }, [entries]);

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

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="max-w-7xl mx-auto px-4 pt-6 pb-16">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />
              Waitlist
            </h1>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} — names, emails & mobile are decrypted from AES-256-GCM storage
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEntries()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-white transition-colors border border-white/10 hover:border-white/20"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => downloadCSV(filtered)}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
              style={{ backgroundColor: "#2563eb" }}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Asset type summary pills */}
        {entries.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setAssetFilter("all")}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${assetFilter === "all" ? "bg-blue-600 text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}
            >
              All ({entries.length})
            </button>
            {allAssets.map((a) => {
              const c = ASSET_COLORS[a] ?? { bg: "bg-white/5", text: "text-slate-400" };
              const active = assetFilter === a;
              return (
                <button
                  key={a}
                  onClick={() => setAssetFilter(assetFilter === a ? "all" : a)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${active ? c.bg + " " + c.text + " ring-1 ring-current" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}
                >
                  {a === "IndianStock" ? "Indian Stock" : a} ({assetCounts[a] ?? 0})
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
          style={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
        >
          <Search className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email or country…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground/40 outline-none"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground/40 text-sm">
            {entries.length === 0 ? "No waitlist entries yet." : "No results match your filter."}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}>
                    {["#", "Name", "Email", "Mobile", "Country", "Assets", "Joined"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <tr
                      key={e.id}
                      className="border-t transition-colors hover:bg-white/[0.02]"
                      style={{ borderColor: "hsl(var(--border))" }}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground/30 font-mono">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-white">{e.name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{e.email}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{e.mobile || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{e.country || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {e.assetTypes.map((a) => <AssetBadge key={a} type={a} />)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground/50 font-mono whitespace-nowrap">
                        {e.joinedAt ? format(new Date(e.joinedAt), "MMM dd, yyyy") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((e, i) => (
                <div
                  key={e.id}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-white text-sm">{e.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{e.email}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/30 font-mono">#{i + 1}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {e.assetTypes.map((a) => <AssetBadge key={a} type={a} />)}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground/50">
                    <span>{e.country || "—"} {e.mobile ? `· ${e.mobile}` : ""}</span>
                    <span>{e.joinedAt ? format(new Date(e.joinedAt), "MMM dd") : "—"}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest mt-4">
              {filtered.length} of {entries.length} entries
            </p>
          </>
        )}
      </main>
    </div>
  );
}
