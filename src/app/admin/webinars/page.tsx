"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  ShieldAlert,
  Search,
  Download,
  CalendarClock,
  RefreshCw,
  Video,
} from "lucide-react";
import { format } from "date-fns";
import {
  formatWebinarSession,
  getUpcomingWebinarSessions,
} from "@/lib/fnoninja/webinar";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

interface Registration {
  id: string;
  name: string;
  email: string;
  mobile: string;
  sessionDate: string;
  source: string;
  joinedAt: string | null;
}

function downloadCSV(entries: Registration[]) {
  const headers = ["Name", "Email", "Mobile", "Session Date", "Source", "Registered At"];
  const rows = entries.map((e) => [
    e.name,
    e.email,
    e.mobile,
    e.sessionDate,
    e.source,
    e.joinedAt ? format(new Date(e.joinedAt), "yyyy-MM-dd HH:mm") : "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `webinar_registrations_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WebinarsAdminPage() {
  const { user, loading: authLoading } = useUser();
  const [entries, setEntries] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const isAdmin = user?.email && ADMIN_EMAILS.has(user.email);

  const fetchEntries = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/fnoninja/webinar/register", {
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

  const countsByDate = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach((e) => {
      m[e.sessionDate] = (m[e.sessionDate] ?? 0) + 1;
    });
    return m;
  }, [entries]);

  const upcoming = useMemo(() => getUpcomingWebinarSessions(10), []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return entries.filter((e) => {
      return (
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.mobile.toLowerCase().includes(q) ||
        e.sessionDate.includes(q)
      );
    });
  }, [entries, query]);

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
              <Video className="h-5 w-5 text-blue-400" />
              Webinar registrations
            </h1>
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              {entries.length} {entries.length === 1 ? "registration" : "registrations"} — names,
              emails & mobiles are decrypted from AES-256-GCM storage
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

        {/* Upcoming sessions calendar */}
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2 flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            Upcoming sessions · daily 8:00 PM IST
          </p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((s) => (
              <div
                key={s.istDate}
                className="rounded-xl px-3 py-2"
                style={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              >
                <p className="text-xs font-semibold text-white">{formatWebinarSession(s)}</p>
                <p className="text-[11px] text-blue-400 font-mono mt-0.5">
                  {countsByDate[s.istDate] ?? 0} registered
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
          style={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
        >
          <Search className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email, mobile or session date…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground/40 outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground/40 text-sm">
            {entries.length === 0 ? "No registrations yet." : "No results match your search."}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div
              className="hidden md:block rounded-xl overflow-hidden"
              style={{ border: "1px solid hsl(var(--border))" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "hsl(var(--card))",
                      borderBottom: "1px solid hsl(var(--border))",
                    }}
                  >
                    {["#", "Name", "Email", "Mobile", "Session", "Source", "Registered"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50"
                      >
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
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{e.sessionDate}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{e.source}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground/50 font-mono whitespace-nowrap">
                        {e.joinedAt ? format(new Date(e.joinedAt), "MMM dd, HH:mm") : "—"}
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
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground/50">
                    <span>{e.mobile || "—"} · {e.sessionDate}</span>
                    <span>{e.joinedAt ? format(new Date(e.joinedAt), "MMM dd") : "—"}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest mt-4">
              {filtered.length} of {entries.length} registrations
            </p>
          </>
        )}
      </main>
    </div>
  );
}
