"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Map, Search, ShieldAlert } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface FnoUserRow {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  products: string[];
  signupSource: string | null;
  fnoninjaJoinedAt: string | null;
  lastSeenAt: string | null;
}

export default function AdminFnoNinjaUsersPage() {
  const { user, isUserLoading } = useUser();
  const isAdmin = user?.email === "hello@tezterminal.com";

  const [users, setUsers] = useState<FnoUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        const all = (data.users || []) as FnoUserRow[];
        setUsers(all.filter((u) => u.products?.includes("fnoninja")));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isAdmin]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q),
    );
  }, [users, search]);

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
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-accent" />
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">FNONINJA Users</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Accounts that signed in on fnoninja.com — tagged via the shared Firebase Google auth pool.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                  FNONINJA Users
                </span>
                <span className="text-2xl font-black font-mono text-white">{users.length}</span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                  FNONINJA-only signups
                </span>
                <span className="text-2xl font-black font-mono text-blue-400">
                  {users.filter((u) => u.signupSource === "fnoninja").length}
                </span>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4 col-span-2 lg:col-span-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                  Also on TezTerminal
                </span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {users.filter((u) => u.products.length > 1).length}
                </span>
              </div>
            </div>

            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Search by name, email, or uid..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/30"
              />
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_120px_120px_120px] gap-2 px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 hidden lg:grid">
                <span>Name</span>
                <span>Email</span>
                <span>Joined FNONINJA</span>
                <span>Signup source</span>
                <span className="text-right">Last active</span>
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 opacity-40">
                  <Map className="h-12 w-12 text-muted-foreground" />
                  <p className="text-xs font-bold uppercase tracking-widest text-white">No FNONINJA users yet</p>
                </div>
              ) : (
                filtered.map((u) => (
                  <div
                    key={u.uid}
                    className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_120px_120px_120px] gap-2 px-4 lg:px-6 py-3.5 border-b border-white/[0.04] last:border-0 items-center"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt="" className="h-7 w-7 rounded-full shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-accent">
                            {(u.displayName || u.email || "?")[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-sm font-bold text-white truncate">{u.displayName || "—"}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground truncate">{u.email || "—"}</span>
                    <span className="text-[10px] font-mono text-white/60">
                      {u.fnoninjaJoinedAt ? format(new Date(u.fnoninjaJoinedAt), "MMM dd, yyyy") : "—"}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-blue-400/80">
                      {u.signupSource || "—"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/40 lg:text-right">
                      {u.lastSeenAt ? format(new Date(u.lastSeenAt), "MMM dd, HH:mm") : "—"}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="text-center text-[10px] text-muted-foreground/30 font-bold uppercase tracking-widest py-2">
              {filtered.length} of {users.length} FNONINJA users
            </div>
          </>
        )}
      </main>
    </div>
  );
}
