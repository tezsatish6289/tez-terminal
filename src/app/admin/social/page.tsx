"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  ShieldAlert,
  Link2,
  Unlink,
  Plus,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface SocialData {
  connected: boolean;
  account: {
    username: string;
    userId: string;
    connectedAt: string;
  } | null;
  watchlist: string[];
  todayStats: {
    postsToday: number;
    postTypes: string[];
  };
  recentActivity: Array<{
    id: string;
    postType: string;
    content: string;
    timestamp: string;
    tweetId: string;
  }>;
}

const POST_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  trade_report: { label: "Trade Report", color: "text-emerald-400 bg-emerald-500/15" },
  liquidation: { label: "Liquidation", color: "text-rose-400 bg-rose-500/15" },
  meme: { label: "Meme", color: "text-amber-400 bg-amber-500/15" },
  influencer: { label: "Influencer", color: "text-blue-400 bg-blue-500/15" },
  engagement_reply: { label: "Reply", color: "text-violet-400 bg-violet-500/15" },
};

function ConnectionCard({
  data,
  onRefresh,
}: {
  data: SocialData;
  onRefresh: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = () => {
    window.location.href = "/api/auth/twitter";
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Twitter? All agents will stop posting.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/admin/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      toast({ title: "Twitter Disconnected" });
      onRefresh();
    } catch {
      toast({
        title: "Error",
        description: "Failed to disconnect.",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!data.connected) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <Link2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Connect Twitter</h3>
            <p className="text-[11px] text-muted-foreground">
              Authenticate via OAuth to enable automated posting.
            </p>
          </div>
        </div>
        <button
          onClick={handleConnect}
          className="w-full py-2.5 px-4 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm font-bold hover:bg-accent/20 transition-colors"
        >
          Connect with Twitter
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.03] to-[#0f0f11] p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              @{data.account!.username}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Connected{" "}
              {format(new Date(data.account!.connectedAt), "MMM dd, yyyy")}
            </p>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
        >
          {disconnecting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Unlink className="h-3 w-3" />
          )}
          Disconnect
        </button>
      </div>
    </div>
  );
}

function WatchlistCard({
  watchlist,
  onRefresh,
}: {
  watchlist: string[];
  onRefresh: () => void;
}) {
  const [handles, setHandles] = useState<string[]>(watchlist);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setHandles(watchlist);
  }, [watchlist]);

  const addHandle = () => {
    const raw = input
      .split(/[,\n\r\t]+/)
      .map((s) => s.replace(/^@/, "").trim().toLowerCase())
      .filter(Boolean);
    const unique = raw.filter((h) => !handles.includes(h));
    if (unique.length === 0) return;
    setHandles((prev) => [...prev, ...unique]);
    setInput("");
    setDirty(true);
  };

  const removeHandle = (h: string) => {
    setHandles((prev) => prev.filter((x) => x !== h));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_watchlist", handles }),
      });
      const data = await res.json();
      if (data.success) {
        setDirty(false);
        toast({ title: "Watchlist Updated", description: `${data.watchlist.length} handles saved.` });
        onRefresh();
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to save watchlist.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-6 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-accent shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          )}
          <div>
            <h3 className="text-sm font-bold text-white">Influencer Watchlist</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {handles.length} handles · Used by the Influencer and Engagement agents.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-accent bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save Changes
            </button>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-white/[0.04] pt-4">
          <div className="flex gap-2">
            <textarea
              placeholder="Paste handles — comma or newline separated, e.g. saylor, VitalikButerin, CryptoHayes"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addHandle();
                }
              }}
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/30 resize-none"
            />
            <button
              onClick={addHandle}
              disabled={!input.trim()}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 self-end"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {handles.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/40 text-center py-4">
              No handles added yet. Add influencer usernames to monitor.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {handles.map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-bold"
                >
                  @{h}
                  <button
                    onClick={() => removeHandle(h)}
                    className="hover:text-rose-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatsCards({ stats }: { stats: SocialData["todayStats"] }) {
  const posted = new Set(stats.postTypes);
  const replyCount = stats.postTypes.filter((t) => t === "engagement_reply").length;

  const agents = [
    { key: "trade_report", label: "Trade Report", window: "05:30 IST" },
    { key: "liquidation", label: "Liquidation", window: "12:00 IST" },
    { key: "meme", label: "Meme", window: "15:00 IST" },
    { key: "influencer", label: "Influencer", window: "18:00 IST" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {agents.map((a) => {
        const done = posted.has(a.key);
        return (
          <div
            key={a.key}
            className={cn(
              "rounded-xl border p-4",
              done
                ? "border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.03] to-[#0f0f11]"
                : "border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11]"
            )}
          >
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
              {a.label}
            </span>
            <div className="flex items-center justify-between mt-1">
              <span
                className={cn(
                  "text-sm font-black",
                  done ? "text-emerald-400" : "text-muted-foreground/40"
                )}
              >
                {done ? "Posted" : "Pending"}
              </span>
              <span className="text-[9px] font-mono text-muted-foreground/30">
                {a.window}
              </span>
            </div>
          </div>
        );
      })}
      <div
        className={cn(
          "rounded-xl border p-4",
          replyCount > 0
            ? "border-violet-500/20 bg-gradient-to-b from-violet-500/[0.03] to-[#0f0f11]"
            : "border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11]"
        )}
      >
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
          Engagement
        </span>
        <div className="flex items-center justify-between mt-1">
          <span
            className={cn(
              "text-sm font-black",
              replyCount > 0 ? "text-violet-400" : "text-muted-foreground/40"
            )}
          >
            {replyCount}/12
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/30">
            replies
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityLog({ activity }: { activity: SocialData["recentActivity"] }) {
  if (activity.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-8">
        <div className="flex flex-col items-center gap-3 opacity-40">
          <Clock className="h-10 w-10 text-muted-foreground" />
          <p className="text-xs font-bold uppercase tracking-widest text-white">
            No Activity Yet
          </p>
          <p className="text-[10px] text-muted-foreground">
            Tweets will appear here once the agents start posting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] overflow-hidden">
      <div className="grid grid-cols-[100px_1fr_100px_80px] gap-2 px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 hidden lg:grid">
        <span>Type</span>
        <span>Content</span>
        <span>Time</span>
        <span className="text-right">Link</span>
      </div>
      {activity.map((a) => {
        const typeConfig = POST_TYPE_LABELS[a.postType] || {
          label: a.postType,
          color: "text-white bg-white/5",
        };
        return (
          <div
            key={a.id}
            className="grid grid-cols-1 lg:grid-cols-[100px_1fr_100px_80px] gap-2 px-6 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors items-center"
          >
            <span
              className={cn(
                "inline-flex items-center w-fit px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                typeConfig.color
              )}
            >
              {typeConfig.label}
            </span>
            <span className="text-[11px] text-white/70 truncate">
              {a.content}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/40">
              {a.timestamp
                ? format(new Date(a.timestamp), "MMM dd, HH:mm")
                : "—"}
            </span>
            <span className="text-right">
              {a.tweetId ? (
                <a
                  href={`https://x.com/i/status/${a.tweetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent/60 hover:text-accent text-[10px] font-bold inline-flex items-center gap-1"
                >
                  <Eye className="h-3 w-3" />
                  View
                </a>
              ) : (
                <span className="text-muted-foreground/20 text-[10px]">—</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminSocialPage() {
  const { user, isUserLoading } = useUser();
  const isAdmin = user?.email === "hello@tezterminal.com";

  const [data, setData] = useState<SocialData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/social");
      const json = await res.json();
      setData(json);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin, fetchData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      toast({
        title: "Twitter Connected",
        description: "Your account is now linked for automated posting.",
      });
      window.history.replaceState({}, "", "/admin/social");
    }
    const error = params.get("error");
    if (error) {
      toast({
        title: "Connection Failed",
        description: decodeURIComponent(error),
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/admin/social");
    }
  }, []);

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
            <CardDescription>
              This page is only available to administrators.
            </CardDescription>
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
            <AlertCircle className="h-5 w-5 text-accent" />
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
              Social
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Twitter automation and content publishing agents.
          </p>
        </header>

        {loading || !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <ConnectionCard data={data} onRefresh={fetchData} />

            {data.connected && (
              <>
                <StatsCards stats={data.todayStats} />
                <WatchlistCard
                  watchlist={data.watchlist}
                  onRefresh={fetchData}
                />
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-white">
                    Recent Activity
                  </h3>
                  <ActivityLog activity={data.recentActivity} />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
