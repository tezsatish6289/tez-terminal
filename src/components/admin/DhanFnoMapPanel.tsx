"use client";

import { useUser } from "@/firebase";
import { formatIstDateTime } from "@/lib/ist-display";
import { Database, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface DhanFnoReport {
  lastSyncedAt: string | null;
  lastValidatedAt: string | null;
  total: number;
  mapped: number;
  missing: string[];
  invalidChain: string[];
  validated: number;
  manual: number;
}

export function DhanFnoMapPanel() {
  const { user } = useUser();
  const [report, setReport] = useState<DhanFnoReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<"sync" | "validate" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/dhan-fno-instruments", {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load Dhan map");
      setReport(json as DhanFnoReport);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const runAction = async (action: "sync" | "validate") => {
    if (!user) return;
    setActing(action);
    setMessage("");
    setError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/dhan-fno-instruments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          action === "sync" ? { action: "sync" } : { action: "validate", limit: 15 },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");

      if (action === "sync") {
        setMessage(
          `Synced ${json.mapped}/${json.total} F&O symbols from Dhan CSV` +
            (json.missing?.length ? ` · ${json.missing.length} missing` : ""),
        );
      } else {
        setMessage(
          `Validated ${json.checked} symbols · ${json.ok} OK` +
            (json.invalid?.length ? ` · ${json.invalid.length} invalid` : ""),
        );
      }
      await fetchReport();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setActing(null);
    }
  };

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(15,23,42,0.5)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-400" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Dhan F&O instrument map
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 max-w-md">
              Pulls Dhan scrip master into Firestore. Required for Dhan-only stock scans when NSE
              circuit is open.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runAction("sync")}
            disabled={acting != null || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-50"
          >
            {acting === "sync" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Database className="h-3 w-3" />
            )}
            Sync from Dhan
          </button>
          <button
            type="button"
            onClick={() => void runAction("validate")}
            disabled={acting != null || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white disabled:opacity-50"
          >
            {acting === "validate" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            Validate 15
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : null}

      {report ? (
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <div>
            <dt className="text-slate-500">Mapped</dt>
            <dd className="text-slate-200 font-mono mt-0.5">
              {report.mapped}/{report.total}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Missing CSV</dt>
            <dd className={report.missing.length ? "text-amber-300 font-mono mt-0.5" : "text-slate-200 font-mono mt-0.5"}>
              {report.missing.length}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Invalid chain</dt>
            <dd className={report.invalidChain.length ? "text-rose-300 font-mono mt-0.5" : "text-slate-200 font-mono mt-0.5"}>
              {report.invalidChain.length}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Validated</dt>
            <dd className="text-slate-200 font-mono mt-0.5">{report.validated}</dd>
          </div>
          <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-slate-500">
            <span>
              Last sync:{" "}
              <span className="text-slate-300">{formatIstDateTime(report.lastSyncedAt)}</span>
            </span>
            <span>
              Last validate:{" "}
              <span className="text-slate-300">{formatIstDateTime(report.lastValidatedAt)}</span>
            </span>
            {report.manual > 0 ? (
              <span>
                Manual overrides: <span className="text-slate-300">{report.manual}</span>
              </span>
            ) : null}
          </div>
        </dl>
      ) : null}

      {report && report.missing.length > 0 ? (
        <p className="mt-3 text-[10px] text-slate-400">
          <span className="text-amber-400/90 font-semibold">Missing: </span>
          <span className="font-mono text-slate-300">
            {report.missing.slice(0, 24).join(", ")}
            {report.missing.length > 24 ? ` +${report.missing.length - 24} more` : ""}
          </span>
        </p>
      ) : null}

      {report && report.invalidChain.length > 0 ? (
        <p className="mt-2 text-[10px] text-slate-400">
          <span className="text-rose-400/90 font-semibold">Invalid chain: </span>
          <span className="font-mono text-slate-300">{report.invalidChain.join(", ")}</span>
        </p>
      ) : null}

      {message ? <p className="mt-3 text-[10px] text-emerald-300/90">{message}</p> : null}
      {error ? <p className="mt-3 text-[10px] text-rose-300/90">{error}</p> : null}
    </div>
  );
}
