"use client";

import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Payment {
  id: string;
  orderId: string;
  days: number;
  priceAmountUsd: number;
  payCurrency: string;
  payAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Subscription {
  userId: string;
  status: string;
  trialStartDate: string;
  trialEndDate: string;
  subscriptionEndDate: string | null;
  createdAt: string;
}

const PAYMENT_STATUS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  finished: { label: "Completed", color: "text-positive", icon: CheckCircle2 },
  sending: { label: "Processing", color: "text-accent", icon: Clock },
  confirming: { label: "Confirming", color: "text-amber-400", icon: Clock },
  confirmed: { label: "Confirmed", color: "text-amber-400", icon: Clock },
  waiting: { label: "Pending", color: "text-muted-foreground", icon: Clock },
  partially_paid: { label: "Partial", color: "text-amber-400", icon: AlertTriangle },
  failed: { label: "Failed", color: "text-negative", icon: XCircle },
  expired: { label: "Expired", color: "text-muted-foreground/50", icon: XCircle },
  refunded: { label: "Refunded", color: "text-muted-foreground", icon: XCircle },
};

function formatDate(dateVal: any) {
  const ms = toMs(dateVal);
  if (!ms) return "--";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toMs(dateVal: any): number {
  if (!dateVal) return 0;
  if (typeof dateVal === "string") return new Date(dateVal).getTime();
  if (dateVal._seconds) return dateVal._seconds * 1000;
  if (dateVal.seconds) return dateVal.seconds * 1000;
  return new Date(dateVal).getTime();
}

function toDateStr(dateVal: any): string {
  return new Date(toMs(dateVal)).toISOString();
}

function getEffectiveStatus(sub: Subscription | null): { status: string; endDate: string | null; daysLeft: number } {
  if (!sub) return { status: "none", endDate: null, daysLeft: 0 };

  const now = Date.now();

  // Check paid subscription first (takes priority over trial)
  if (sub.subscriptionEndDate) {
    const end = toMs(sub.subscriptionEndDate);
    const daysLeft = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    if (daysLeft > 0) {
      return { status: "active", endDate: toDateStr(sub.subscriptionEndDate), daysLeft };
    }
  }

  // Then check trial
  if (sub.trialEndDate) {
    const end = toMs(sub.trialEndDate);
    const daysLeft = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    if (daysLeft > 0) {
      return { status: "trial", endDate: toDateStr(sub.trialEndDate), daysLeft };
    }
  }

  const fallback = sub.subscriptionEndDate || sub.trialEndDate;
  return { status: "expired", endDate: fallback ? toDateStr(fallback) : null, daysLeft: 0 };
}

export default function PurchasesPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    fetch(`/api/subscription/history?uid=${user.uid}`)
      .then((res) => res.json())
      .then((data) => {
        console.log("[Purchases] API response:", JSON.stringify(data));
        if (data.error) {
          console.error("[Purchases] API error:", data.error);
        }
        setSubscription(data.subscription ?? null);
        const completed = (data.payments || []).filter(
          (p: Payment) => p.status === "finished" || p.status === "sending"
        );
        setPayments(completed);
      })
      .catch((err) => console.error("[Purchases] Fetch failed:", err))
      .finally(() => setLoading(false));
  }, [user?.uid]);

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

  const { status, endDate, daysLeft } = getEffectiveStatus(subscription);
  console.log("[Purchases] subscription:", subscription, "→ effective:", { status, endDate, daysLeft });
  const isTrial = status === "trial";
  const isActive = status === "active";
  const isExpired = status === "expired" || status === "none";

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <TopBar />

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Current Plan */}
        <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-accent">Current Plan</h2>
            </div>
            <Link
              href="/subscribe"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-accent-foreground font-bold text-[11px] uppercase tracking-wider hover:bg-accent/90 transition-colors"
            >
              {isExpired ? "Get Access" : "Extend Access"}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className={cn(
                  "text-lg font-black",
                  isTrial ? "text-accent" : isActive ? "text-positive" : "text-negative"
                )}>
                  {isTrial ? "Free Trial" : isActive ? "Active" : "Expired"}
                </span>
              </div>
              {endDate && (
                <p className="text-sm text-muted-foreground">
                  {isExpired ? "Expired on " : "Valid until "}
                  <span className="font-semibold text-foreground/80">{formatDate(endDate)}</span>
                </p>
              )}
            </div>
            {(isTrial || isActive) && daysLeft > 0 && (
              <div className="text-right">
                <span className="text-3xl font-black tabular-nums text-foreground">{daysLeft}</span>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold">days left</p>
              </div>
            )}
          </div>
        </div>

        {/* Purchase History */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-accent">Purchase History</h2>
            </div>
          </div>

          {payments.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
              <CreditCard className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">No purchases yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => {
                const cfg = PAYMENT_STATUS[payment.status] || PAYMENT_STATUS.waiting;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={payment.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.04]">
                      <StatusIcon className={cn("w-4 h-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-foreground">{payment.days}-day access</span>
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.color)}>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                        <span>{formatDate(payment.createdAt)}</span>
                        <span>·</span>
                        <span className="font-mono">{payment.orderId}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-foreground">${payment.priceAmountUsd}</span>
                      <p className="text-[10px] text-muted-foreground/40 font-mono">
                        {payment.payAmount} USDT
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
