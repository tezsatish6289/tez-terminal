"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useMemo } from "react";
import { Loader2, ShieldAlert, Search, RefreshCw, MessageSquare, Mail, Phone, Globe } from "lucide-react";
import { format } from "date-fns";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  mobile: string;
  country: string;
  message: string;
  status: "new" | "read" | "replied";
  source: string;
  createdAt: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  new:     { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa",  label: "New"     },
  read:    { bg: "rgba(251,191,36,0.15)",  text: "#fbbf24",  label: "Read"    },
  replied: { bg: "rgba(34,197,94,0.15)",   text: "#22c55e",  label: "Replied" },
};

export default function AdminContactPage() {
  const { user, loading: authLoading } = useUser();
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "read" | "replied">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = user && ADMIN_EMAILS.has(user.email ?? "");

  const fetchSubmissions = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/contact", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
      setSubmissions(data.submissions ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const updateStatus = async (id: string, status: string) => {
    if (!user || updatingId) return;
    setUpdatingId(id);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/admin/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ id, status }),
      });
      setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, status: status as ContactSubmission["status"] } : s));
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const q = search.toLowerCase();
      const matchesSearch = !q || [s.name, s.email, s.country, s.message].some((v) => v.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [submissions, search, statusFilter]);

  const counts = useMemo(() => ({
    all:     submissions.length,
    new:     submissions.filter((s) => s.status === "new").length,
    read:    submissions.filter((s) => s.status === "read").length,
    replied: submissions.filter((s) => s.status === "replied").length,
  }), [submissions]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080f1e] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#080f1e] flex flex-col items-center justify-center gap-3 text-slate-400">
        <ShieldAlert className="h-10 w-10 text-red-400" />
        <p className="font-semibold">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080f1e] text-slate-100 font-sans">
      <TopBar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Contact Submissions</h1>
            <p className="text-sm text-slate-500 mt-0.5">{counts.all} total · {counts.new} new</p>
          </div>
          <button
            onClick={fetchSubmissions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 disabled:opacity-50"
            style={{ backgroundColor: "rgba(37,99,235,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {(["all", "new", "read", "replied"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all"
              style={{
                backgroundColor: statusFilter === s ? "rgba(37,99,235,0.2)" : "rgba(255,255,255,0.04)",
                color: statusFilter === s ? "#60a5fa" : "#475569",
                border: `1px solid ${statusFilter === s ? "rgba(96,165,250,0.3)" : "rgba(90,140,220,0.1)"}`,
              }}
            >
              {s} ({counts[s]})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, country, or message…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none text-slate-200 placeholder-slate-700"
            style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.15)" }}
          />
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-slate-600">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No submissions found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => {
              const st = STATUS_STYLES[s.status] ?? STATUS_STYLES.new;
              const isOpen = expanded === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{ backgroundColor: "#0a1628", border: `1px solid ${isOpen ? "rgba(96,165,250,0.25)" : "rgba(90,140,220,0.12)"}` }}
                >
                  {/* Row header */}
                  <button
                    onClick={() => {
                      setExpanded(isOpen ? null : s.id);
                      if (s.status === "new" && !isOpen) updateStatus(s.id, "read");
                    }}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-sm text-slate-100 truncate">{s.name}</span>
                        <span
                          className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: st.bg, color: st.text }}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Mail className="h-3 w-3" />{s.email}
                        </span>
                        {s.mobile && s.mobile !== "—" && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Phone className="h-3 w-3" />{s.mobile}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Globe className="h-3 w-3" />{s.country}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0">
                      {s.createdAt ? format(new Date(s.createdAt), "dd MMM yyyy, HH:mm") : "—"}
                    </span>
                  </button>

                  {/* Expanded message + actions */}
                  {isOpen && (
                    <div className="px-5 pb-5" style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}>
                      <p className="text-sm leading-relaxed text-slate-300 mt-4 whitespace-pre-wrap">{s.message}</p>
                      <div className="flex items-center gap-2 mt-4 flex-wrap">
                        <span className="text-xs text-slate-600 mr-2">Mark as:</span>
                        {(["new", "read", "replied"] as const).map((status) => (
                          <button
                            key={status}
                            onClick={() => updateStatus(s.id, status)}
                            disabled={s.status === status || updatingId === s.id}
                            className="px-3 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
                            style={{
                              backgroundColor: s.status === status ? STATUS_STYLES[status].bg : "rgba(255,255,255,0.04)",
                              color: s.status === status ? STATUS_STYLES[status].text : "#475569",
                              border: `1px solid ${s.status === status ? "transparent" : "rgba(90,140,220,0.1)"}`,
                            }}
                          >
                            {updatingId === s.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : STATUS_STYLES[status].label}
                          </button>
                        ))}
                        <a
                          href={`mailto:${s.email}`}
                          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all hover:scale-105"
                          style={{ backgroundColor: "rgba(37,99,235,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
                        >
                          <Mail className="h-3 w-3" /> Reply via email
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
