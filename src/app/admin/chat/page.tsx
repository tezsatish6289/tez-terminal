"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useCallback } from "react";
import { Loader2, ShieldAlert, RefreshCw, Flag, Trash2, Ban, Check } from "lucide-react";
import { format } from "date-fns";

const ADMIN_EMAILS = new Set(["hello@tezterminal.com"]);

interface ChatReport {
  id: string;
  roomId: string;
  messageId: string;
  reporterId: string;
  reason: string;
  messageText: string;
  messageAuthorId: string;
  status: string;
  createdAt: string;
}

export default function AdminChatPage() {
  const { user, isUserLoading } = useUser();
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = !!user && ADMIN_EMAILS.has(user.email ?? "");

  const fetchReports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/chat/moderate", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
      setReports(data.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin) fetchReports();
  }, [isAdmin, fetchReports]);

  const moderate = async (id: string, payload: Record<string, unknown>) => {
    if (!user || busyId) return;
    setBusyId(id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Action failed");
      }
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  if (isUserLoading) {
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Chat Moderation</h1>
            <p className="text-sm text-slate-500 mt-0.5">{reports.length} open reports</p>
          </div>
          <button
            onClick={fetchReports}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 disabled:opacity-50"
            style={{ backgroundColor: "rgba(37,99,235,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
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
        ) : reports.length === 0 ? (
          <div className="text-center py-24 text-slate-600">
            <Flag className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No open reports</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl p-5"
                style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                    #{r.roomId}
                  </span>
                  <span className="text-xs text-slate-600">
                    {r.createdAt ? format(new Date(r.createdAt), "dd MMM yyyy, HH:mm") : "—"}
                  </span>
                </div>

                <p className="text-sm text-slate-200 whitespace-pre-wrap break-words mb-2">{r.messageText || "(empty)"}</p>
                <p className="text-xs text-slate-500 mb-1">Reason: <span className="text-slate-300">{r.reason}</span></p>
                <p className="text-[11px] text-slate-600 font-mono">author: {r.messageAuthorId} · reporter: {r.reporterId}</p>

                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <button
                    onClick={() => moderate(r.id, { action: "delete", roomId: r.roomId, messageId: r.messageId })}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                    style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete message
                  </button>
                  <button
                    onClick={() => {
                      const reason = window.prompt("Ban reason (shown to the user)?") ?? "";
                      if (reason === "") return;
                      moderate(r.id, { action: "ban", userId: r.messageAuthorId, reason });
                    }}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                    style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    <Ban className="h-3.5 w-3.5" /> Ban author
                  </button>
                  <button
                    onClick={() => moderate(r.id, { action: "resolveReport", reportId: r.id, status: "dismissed" })}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 disabled:opacity-50 ml-auto"
                    style={{ backgroundColor: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(90,140,220,0.15)" }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => moderate(r.id, { action: "resolveReport", reportId: r.id, status: "resolved" })}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                    style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}
                  >
                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
