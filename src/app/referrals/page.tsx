"use client";

import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trackReferralLinkCopied, trackReferralPageView } from "@/firebase/analytics";
import {
  Loader2,
  Copy,
  Check,
  Gift,
  Users,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Wallet,
  ExternalLink,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReferredUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  joinedAt: string | null;
}

interface Commission {
  id: string;
  referredUserId: string;
  paymentId: string;
  purchaseAmountUsd: number;
  commissionRate: number;
  commissionAmountUsd: number;
  status: "pending" | "paid" | "failed";
  createdAt: string;
  paidAt: string | null;
}

interface Payout {
  id: string;
  totalAmountUsd: number;
  walletAddress: string;
  network: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface DashboardStats {
  totalReferred: number;
  totalEarned: number;
  pendingAmount: number;
  paidAmount: number;
}

function formatDate(dateVal: any) {
  if (!dateVal) return "--";
  const ms =
    typeof dateVal === "string"
      ? new Date(dateVal).getTime()
      : dateVal._seconds
        ? dateVal._seconds * 1000
        : new Date(dateVal).getTime();
  if (!ms) return "--";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const COMMISSION_STATUS: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: { label: "Pending", color: "text-amber-400", icon: Clock },
  paid: { label: "Paid", color: "text-positive", icon: CheckCircle2 },
  failed: { label: "Failed", color: "text-negative", icon: XCircle },
};

const PAYOUT_STATUS: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: { label: "Pending", color: "text-muted-foreground", icon: Clock },
  processing: { label: "Processing", color: "text-amber-400", icon: Clock },
  completed: { label: "Completed", color: "text-positive", icon: CheckCircle2 },
  failed: { label: "Failed", color: "text-negative", icon: XCircle },
};

export default function ReferralsPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletInput, setWalletInput] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletSuccess, setWalletSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalReferred: 0,
    totalEarned: 0,
    pendingAmount: 0,
    paidAmount: 0,
  });

  const fetchDashboard = useCallback(async (uid: string) => {
    try {
      const [codeRes, dashRes] = await Promise.all([
        fetch(`/api/referral/code?uid=${uid}`),
        fetch(`/api/referral/dashboard?uid=${uid}`),
      ]);
      const codeData = await codeRes.json();
      const dashData = await dashRes.json();

      if (codeData.referralLink) setReferralLink(codeData.referralLink);
      if (codeData.referralCode) setReferralCode(codeData.referralCode);

      if (dashData.walletAddress) {
        setWalletAddress(dashData.walletAddress);
        setWalletInput(dashData.walletAddress);
      }
      setReferredUsers(dashData.referredUsers || []);
      setCommissions(dashData.commissions || []);
      setPayouts(dashData.payouts || []);
      if (dashData.stats) setStats(dashData.stats);
    } catch (err) {
      console.error("[Referrals] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    trackReferralPageView();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    fetchDashboard(user.uid);
  }, [user?.uid, fetchDashboard]);

  const handleCopy = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    trackReferralLinkCopied();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveWallet = async () => {
    if (!user?.uid || !walletInput.trim()) return;
    setWalletSaving(true);
    setWalletError("");
    setWalletSuccess(false);

    try {
      const res = await fetch("/api/referral/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, walletAddress: walletInput.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setWalletError(data.error || "Failed to save wallet");
      } else {
        setWalletAddress(data.walletAddress);
        setWalletSuccess(true);
        setTimeout(() => setWalletSuccess(false), 3000);
      }
    } catch {
      setWalletError("Network error");
    } finally {
      setWalletSaving(false);
    }
  };

  if (isUserLoading || loading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/");
    return null;
  }

  // Map referred user IDs to names for display in commission table
  const userMap = new Map(referredUsers.map((u) => [u.uid, u]));

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <TopBar />

      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Gift className="w-5 h-5 text-accent" />
            <h1 className="text-xl font-black text-foreground">Refer & Earn</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Share your referral link and earn <span className="text-accent font-bold">25% commission</span> in USDT on every purchase made by people you refer.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Referred Users",
              value: stats.totalReferred,
              icon: Users,
              format: (v: number) => String(v),
            },
            {
              label: "Total Earned",
              value: stats.totalEarned,
              icon: TrendingUp,
              format: (v: number) => `$${v.toFixed(2)}`,
            },
            {
              label: "Pending",
              value: stats.pendingAmount,
              icon: Clock,
              format: (v: number) => `$${v.toFixed(2)}`,
            },
            {
              label: "Paid Out",
              value: stats.paidAmount,
              icon: DollarSign,
              format: (v: number) => `$${v.toFixed(2)}`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <stat.icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </span>
              </div>
              <span className="text-lg font-black tabular-nums text-foreground">
                {stat.format(stat.value)}
              </span>
            </div>
          ))}
        </div>

        {/* Referral Link */}
        <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-6">
          <div className="flex items-center gap-2 mb-4">
            <ExternalLink className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Your Referral Link
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 font-mono text-sm text-foreground/80 truncate">
              {referralLink || "Loading..."}
            </div>
            <button
              onClick={handleCopy}
              disabled={!referralLink}
              className={cn(
                "shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all",
                copied
                  ? "bg-positive/20 text-positive border border-positive/30"
                  : "bg-accent text-accent-foreground hover:bg-accent/90"
              )}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Wallet Address */}
        <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-6">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Payout Wallet
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Enter your USDT (TRC-20) wallet address to receive weekly commission payouts.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={walletInput}
              onChange={(e) => {
                setWalletInput(e.target.value);
                setWalletError("");
                setWalletSuccess(false);
              }}
              placeholder="T..."
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/50 transition-colors"
            />
            <button
              onClick={handleSaveWallet}
              disabled={walletSaving || !walletInput.trim() || walletInput.trim() === walletAddress}
              className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg bg-accent text-accent-foreground font-bold text-[11px] uppercase tracking-wider hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {walletSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : walletSuccess ? (
                <Check className="w-4 h-4" />
              ) : null}
              {walletSuccess ? "Saved" : "Save"}
            </button>
          </div>
          {walletError && (
            <p className="text-xs text-negative mt-2">{walletError}</p>
          )}
          {walletAddress && !walletError && !walletSuccess && (
            <p className="text-xs text-muted-foreground/50 mt-2 font-mono truncate">
              Current: {walletAddress}
            </p>
          )}
        </div>

        {/* Referred Users */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Referred Users
            </h2>
          </div>

          {referredUsers.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">
                No referrals yet. Share your link to get started!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {referredUsers.map((ru) => (
                <div
                  key={ru.uid}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4"
                >
                  <div className="w-9 h-9 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent font-bold text-xs uppercase">
                    {(ru.displayName || ru.email || "?")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {ru.displayName || "Anonymous"}
                    </p>
                    <p className="text-[11px] text-muted-foreground/50 truncate">
                      {ru.email || "No email"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground/40">Joined</p>
                    <p className="text-xs font-semibold text-foreground/70">
                      {formatDate(ru.joinedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commission History */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Commission History
            </h2>
          </div>

          {commissions.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
              <DollarSign className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">
                No commissions yet
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {commissions.map((c) => {
                const cfg =
                  COMMISSION_STATUS[c.status] || COMMISSION_STATUS.pending;
                const StatusIcon = cfg.icon;
                const referredUser = userMap.get(c.referredUserId);

                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.04]">
                      <StatusIcon className={cn("w-4 h-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-foreground">
                          {referredUser?.displayName || referredUser?.email || "User"}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider",
                            cfg.color
                          )}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                        <span>{formatDate(c.createdAt)}</span>
                        <span>·</span>
                        <span>
                          Purchase: ${c.purchaseAmountUsd} × {Math.round(c.commissionRate * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-positive">
                        +${c.commissionAmountUsd.toFixed(2)}
                      </span>
                      <p className="text-[10px] text-muted-foreground/40">USDT</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payout History */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Payout History
            </h2>
          </div>

          {payouts.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
              <Wallet className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">
                No payouts yet. Commissions are paid out weekly.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {payouts.map((p) => {
                const cfg =
                  PAYOUT_STATUS[p.status] || PAYOUT_STATUS.pending;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.04]">
                      <StatusIcon className={cn("w-4 h-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-foreground">
                          Weekly Payout
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider",
                            cfg.color
                          )}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                        <span>{formatDate(p.createdAt)}</span>
                        <span>·</span>
                        <span className="font-mono truncate max-w-[200px]">
                          {p.walletAddress}
                        </span>
                      </div>
                      {p.errorMessage && (
                        <p className="text-[10px] text-negative mt-1 truncate">
                          {p.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-foreground">
                        ${p.totalAmountUsd.toFixed(2)}
                      </span>
                      <p className="text-[10px] text-muted-foreground/40 uppercase">
                        USDT {p.network}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
