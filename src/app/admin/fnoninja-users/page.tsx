"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarClock,
  Loader2,
  Map,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminEmail } from "@/lib/admin-emails-client";

interface FnoUserRow {
  uid: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  photoURL: string | null;
  joinedAt: string | null;
  lastSeenAt: string | null;
  planName: string;
  planCode: string | null;
  tier: string | null;
  status: "trial" | "active" | "expired" | "none";
  isActive: boolean;
  alertsEnabled: boolean;
  expiryDate: string | null;
  autoRenew: boolean | null;
  manualOverride: boolean;
  zohoCustomerId: string | null;
  totalPaidInr: number | null;
  paymentCount: number | null;
  lastPaymentAt: string | null;
  paymentsSyncedAt: string | null;
}

type AdminTier = "none" | "free" | "silver" | "gold" | "daypass";

const TIER_OPTIONS: { value: AdminTier; label: string }[] = [
  { value: "free", label: "Free trial" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "daypass", label: "Day Pass" },
  { value: "none", label: "Expired (no access)" },
];

const STATUS_STYLES: Record<FnoUserRow["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  trial: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  expired: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  none: "bg-white/5 text-muted-foreground border-white/10",
};

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local `datetime-local` input value (minute precision) from an ISO string. */
function toDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return format(new Date(t), "yyyy-MM-dd'T'HH:mm");
}

/** Quick expiry presets for testing (label → offset from now, ms). */
const EXPIRY_PRESETS: { label: string; ms: number }[] = [
  { label: "Expire now", ms: -60_000 },
  { label: "+1 hour", ms: 60 * 60_000 },
  { label: "+1 day", ms: 24 * 60 * 60_000 },
  { label: "+7 days", ms: 7 * 24 * 60 * 60_000 },
  { label: "+30 days", ms: 30 * 24 * 60 * 60_000 },
];

export default function AdminFnoNinjaUsersPage() {
  const { user, isUserLoading } = useUser();
  const isAdmin = isAdminEmail(user?.email);

  const [users, setUsers] = useState<FnoUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"last_seen" | "name_az" | "name_za">("last_seen");
  const [joinFrom, setJoinFrom] = useState("");
  const [joinTo, setJoinTo] = useState("");
  const [usedFrom, setUsedFrom] = useState("");
  const [usedTo, setUsedTo] = useState("");

  // Row action state
  const [syncingUid, setSyncingUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<FnoUserRow | null>(null);

  const authedFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const token = await user?.getIdToken();
      return fetch(input, {
        ...init,
        headers: {
          ...(init.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [user],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/fnoninja-users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setUsers(
        ((data.users || []) as FnoUserRow[]).map((u) => ({
          ...u,
          alertsEnabled: u.alertsEnabled === true,
        })),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const jf = joinFrom ? new Date(joinFrom).getTime() : null;
    const jt = joinTo ? new Date(joinTo).getTime() + 86_400_000 : null;
    const uf = usedFrom ? new Date(usedFrom).getTime() : null;
    const ut = usedTo ? new Date(usedTo).getTime() + 86_400_000 : null;

    const rows = users.filter((u) => {
      if (q) {
        const hay = `${u.displayName ?? ""} ${u.email ?? ""} ${u.phone ?? ""} ${u.uid}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (planFilter !== "all" && u.planName !== planFilter) return false;
      if (statusFilter === "active" && !u.isActive) return false;
      if (statusFilter === "expired" && u.isActive) return false;
      if (statusFilter !== "all" && statusFilter !== "active" && statusFilter !== "expired") {
        if (u.status !== statusFilter) return false;
      }
      if (jf || jt) {
        const j = u.joinedAt ? new Date(u.joinedAt).getTime() : null;
        if (j === null) return false;
        if (jf && j < jf) return false;
        if (jt && j >= jt) return false;
      }
      if (uf || ut) {
        const s = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : null;
        if (s === null) return false;
        if (uf && s < uf) return false;
        if (ut && s >= ut) return false;
      }
      return true;
    });

    const nameKey = (u: FnoUserRow) =>
      (u.displayName || u.email || u.uid).trim().toLocaleLowerCase();

    if (sortBy === "name_az") {
      return [...rows].sort((a, b) => nameKey(a).localeCompare(nameKey(b)));
    }
    if (sortBy === "name_za") {
      return [...rows].sort((a, b) => nameKey(b).localeCompare(nameKey(a)));
    }
    // Default API order is last-seen desc; keep stable after filters.
    return rows;
  }, [users, search, planFilter, statusFilter, sortBy, joinFrom, joinTo, usedFrom, usedTo]);

  const counts = useMemo(() => {
    const today = startOfToday();
    const active = users.filter((u) => u.isActive).length;
    const activeWithAlerts = users.filter((u) => u.isActive && u.alertsEnabled).length;
    return {
      total: users.length,
      today: users.filter((u) => u.lastSeenAt && new Date(u.lastSeenAt).getTime() >= today).length,
      active,
      expired: users.filter((u) => !u.isActive).length,
      activeWithAlerts,
      activeWithAlertsPct: active > 0 ? Math.round((activeWithAlerts / active) * 100) : 0,
    };
  }, [users]);

  const syncPayments = useCallback(
    async (row: FnoUserRow) => {
      setSyncingUid(row.uid);
      try {
        const res = await authedFetch(`/api/admin/fnoninja-users/${row.uid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync-payments" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sync failed");
        setUsers((prev) =>
          prev.map((u) =>
            u.uid === row.uid
              ? {
                  ...u,
                  totalPaidInr: data.totalPaidInr,
                  paymentCount: data.paymentCount,
                  lastPaymentAt: data.lastPaymentAt,
                  paymentsSyncedAt: new Date().toISOString(),
                }
              : u,
          ),
        );
      } catch (e: any) {
        alert(`Payment sync failed: ${e.message}`);
      } finally {
        setSyncingUid(null);
      }
    },
    [authedFetch],
  );

  const deleteAccount = useCallback(
    async (row: FnoUserRow) => {
      const ok = window.confirm(
        `Delete ${row.email || row.uid}?\n\nThis removes their Firebase login and all Firestore data (profile, subscription, chat). It does NOT touch Zoho billing. This cannot be undone.`,
      );
      if (!ok) return;
      setDeletingUid(row.uid);
      try {
        const res = await authedFetch(`/api/admin/fnoninja-users/${row.uid}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Delete failed");
        setUsers((prev) => prev.filter((u) => u.uid !== row.uid));
      } catch (e: any) {
        alert(`Delete failed: ${e.message}`);
      } finally {
        setDeletingUid(null);
      }
    },
    [authedFetch],
  );

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <ShieldAlert className="h-12 w-12 text-rose-400 mx-auto mb-4" />
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>This page is only available to administrators.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TopBar />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Map className="h-5 w-5 text-accent" />
              <h1 className="text-3xl font-black text-white tracking-tighter uppercase">FNONINJA Users</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Accounts, subscriptions and payments. Manage plans, sync Zoho payments, or delete test accounts.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white hover:bg-white/[0.06]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {/* Counts */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Total users", value: String(counts.total), color: "text-white" },
            { label: "Logged in today", value: String(counts.today), color: "text-blue-400" },
            { label: "Active", value: String(counts.active), color: "text-emerald-400" },
            { label: "Expired", value: String(counts.expired), color: "text-rose-400" },
            {
              label: "Active w/ alerts",
              value: `${counts.activeWithAlertsPct}%`,
              sub: `${counts.activeWithAlerts} / ${counts.active}`,
              color: "text-amber-400",
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4"
            >
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                {c.label}
              </span>
              <span className={`text-2xl font-black font-mono ${c.color}`}>{c.value}</span>
              {"sub" in c && c.sub ? (
                <span className="mt-0.5 block text-[10px] font-mono text-muted-foreground/60">{c.sub}</span>
              ) : null}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/60 -mt-3">
          Alerts default off for everyone. Expired users keep their toggle, but the cron skips them until they are active again.
        </p>

        {/* Filters */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Search name, email, mobile, or uid..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/30"
              />
            </div>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/30"
            >
              <option value="all">All plans</option>
              <option value="Free trial">Free trial</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Day Pass">Day Pass</option>
              <option value="—">No plan</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/30"
            >
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="trial">On trial</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "last_seen" | "name_az" | "name_za")}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/30"
              aria-label="Sort users"
            >
              <option value="last_seen">Sort: Last login</option>
              <option value="name_az">Sort: Name A–Z</option>
              <option value="name_za">Sort: Name Z–A</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            <label className="flex items-center gap-1.5">
              Joined
              <input type="date" value={joinFrom} onChange={(e) => setJoinFrom(e.target.value)} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-white" />
              <span>→</span>
              <input type="date" value={joinTo} onChange={(e) => setJoinTo(e.target.value)} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-white" />
            </label>
            <label className="flex items-center gap-1.5">
              Last used
              <input type="date" value={usedFrom} onChange={(e) => setUsedFrom(e.target.value)} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-white" />
              <span>→</span>
              <input type="date" value={usedTo} onChange={(e) => setUsedTo(e.target.value)} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-white" />
            </label>
            {(joinFrom || joinTo || usedFrom || usedTo || planFilter !== "all" || statusFilter !== "all" || search) && (
              <button
                onClick={() => {
                  setSearch("");
                  setPlanFilter("all");
                  setStatusFilter("all");
                  setJoinFrom("");
                  setJoinTo("");
                  setUsedFrom("");
                  setUsedTo("");
                }}
                className="text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-[1.6fr_110px_120px_110px_130px_150px_110px] gap-2 px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50">
                <span>User</span>
                <span>Joined</span>
                <span>Last login</span>
                <span>Plan</span>
                <span>Expiry</span>
                <span>Payments (₹)</span>
                <span className="text-right">Actions</span>
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 opacity-40">
                  <Map className="h-12 w-12 text-muted-foreground" />
                  <p className="text-xs font-bold uppercase tracking-widest text-white">No users match</p>
                </div>
              ) : (
                filtered.map((u) => (
                  <div
                    key={u.uid}
                    className="grid grid-cols-[1.6fr_110px_120px_110px_130px_150px_110px] gap-2 px-6 py-3.5 border-b border-white/[0.04] last:border-0 items-center"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {u.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.photoURL} alt="" className="h-7 w-7 rounded-full shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-accent">
                            {(u.displayName || u.email || "?")[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{u.displayName || "—"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{u.email || u.uid}</p>
                        <p className="text-[11px] font-mono text-muted-foreground/70 truncate">
                          {u.phone ? `+91 ${u.phone}` : "no mobile"}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-white/60">
                      {u.joinedAt ? format(new Date(u.joinedAt), "MMM dd, yyyy") : "—"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {u.lastSeenAt ? format(new Date(u.lastSeenAt), "MMM dd, HH:mm") : "—"}
                    </span>
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_STYLES[u.status]}`}
                      >
                        {u.planName}
                      </span>
                      {u.manualOverride && (
                        <span className="text-[8px] font-bold uppercase tracking-wide text-amber-400/70">
                          manual
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-mono ${u.isActive ? "text-white/70" : "text-rose-400/70"}`}
                    >
                      {u.expiryDate ? format(new Date(u.expiryDate), "MMM dd, yyyy") : "—"}
                      {!u.isActive && u.status !== "none" ? " (exp)" : ""}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-mono text-white/70">
                        {u.totalPaidInr != null ? `₹${u.totalPaidInr.toLocaleString("en-IN")}` : "—"}
                        {u.paymentCount != null && u.paymentCount > 0 ? ` · ${u.paymentCount}` : ""}
                      </span>
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground/40">
                        {u.paymentsSyncedAt
                          ? `synced ${format(new Date(u.paymentsSyncedAt), "MMM dd")}`
                          : "not synced"}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        title="Sync payments from Zoho"
                        onClick={() => void syncPayments(u)}
                        disabled={syncingUid === u.uid}
                        className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-muted-foreground hover:text-white hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncingUid === u.uid ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        title="Edit plan / expiry"
                        onClick={() => setEditRow(u)}
                        className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-muted-foreground hover:text-accent hover:bg-white/[0.06]"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Delete account"
                        onClick={() => void deleteAccount(u)}
                        disabled={deletingUid === u.uid}
                        className="rounded-md border border-rose-500/20 bg-rose-500/5 p-1.5 text-rose-400/80 hover:bg-rose-500/15 disabled:opacity-40"
                      >
                        {deletingUid === u.uid ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="text-center text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest py-2">
          {filtered.length} of {users.length} users
        </div>
      </main>

      {editRow && (
        <EditPlanModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
            setEditRow(null);
          }}
          authedFetch={authedFetch}
        />
      )}
    </div>
  );
}

function EditPlanModal({
  row,
  onClose,
  onSaved,
  authedFetch,
}: {
  row: FnoUserRow;
  onClose: () => void;
  onSaved: (row: FnoUserRow) => void;
  authedFetch: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const initialTier: AdminTier =
    row.status === "none" ? "none" : ((row.tier as AdminTier) ?? "free");
  const [tier, setTier] = useState<AdminTier>(initialTier);
  const [expiry, setExpiry] = useState(
    toDateTimeInput(row.expiryDate) || toDateTimeInput(new Date(Date.now() + 30 * 86_400_000).toISOString()),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setPreset = (ms: number) => setExpiry(toDateTimeInput(new Date(Date.now() + ms).toISOString()));
  const expiryIso = expiry ? new Date(expiry).toISOString() : "";

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await authedFetch(`/api/admin/fnoninja-users/${row.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          tier,
          expiryDate: tier === "none" ? undefined : expiryIso,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      const isActive = tier !== "none";
      const planName =
        tier === "free" ? "Free trial" : tier === "silver" ? "Silver" : tier === "gold" ? "Gold" : tier === "daypass" ? "Day Pass" : "—";
      onSaved({
        ...row,
        tier: tier === "none" ? null : tier,
        planName,
        status: tier === "none" ? "expired" : tier === "free" ? "trial" : "active",
        isActive,
        expiryDate: tier === "none" ? row.expiryDate : expiryIso,
        manualOverride: true,
        autoRenew: false,
      });
    } catch (e: any) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141416] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-black text-white">Edit plan &amp; expiry</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4 truncate">
          {row.email || row.uid}
          {row.phone ? ` · +91 ${row.phone}` : ""}
        </p>

        <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">
          Plan
        </label>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as AdminTier)}
          className="w-full mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/30"
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {tier !== "none" && (
          <>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">
              {tier === "free" ? "Trial ends" : "Access expires"}
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {EXPIRY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPreset(p.ms)}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:border-accent/30 hover:text-white"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full mb-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/30"
            />
            <p className="mb-4 text-[11px] text-muted-foreground/70">
              {expiryIso && new Date(expiryIso).getTime() <= Date.now()
                ? "In the past → account will be expired (paywall)."
                : "Minute precision — use “+1 hour” to test the hours-left badge & timer."}
            </p>
          </>
        )}

        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80 mb-4">
          Manual override. If this user has a <b>live Zoho subscription</b>, the next Zoho webhook
          (renewal/change) will overwrite this. Use for trials, Day Pass, comps, refunds, or expired
          accounts.
        </p>

        {err && <p className="text-xs text-rose-400 mb-3">{err}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-black hover:bg-accent/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
