"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { useSubscription } from "@/hooks/use-subscription";
import {
  DEFAULT_PLANS,
  calculatePrice,
  getNetworkWarning,
  type Plan,
} from "@/lib/subscription";
import {
  Loader2,
  Send,
  Check,
  Copy,
  AlertTriangle,
  ArrowLeft,
  Shield,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Step = "select" | "paying" | "success";

interface PaymentInfo {
  paymentId: number;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  priceAmountUsd: number;
  orderId: string;
  expirationEstimate: string;
}

const STATUS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  waiting: { label: "Waiting for payment", icon: "⏳", color: "text-muted-foreground" },
  confirming: { label: "Payment detected — confirming", icon: "🔄", color: "text-amber-400" },
  confirmed: { label: "Confirmed — processing", icon: "✅", color: "text-positive" },
  sending: { label: "Processing payment", icon: "📤", color: "text-accent" },
  finished: { label: "Payment complete!", icon: "🎉", color: "text-positive" },
  partially_paid: { label: "Partial payment received", icon: "⚠️", color: "text-amber-400" },
  failed: { label: "Payment failed", icon: "❌", color: "text-negative" },
  expired: { label: "Payment expired", icon: "⏰", color: "text-negative" },
  refunded: { label: "Payment refunded", icon: "↩️", color: "text-muted-foreground" },
};

const STATUS_ORDER = ["waiting", "confirming", "confirmed", "sending", "finished"];

function StatusProgress({ status }: { status: string }) {
  const currentIdx = STATUS_ORDER.indexOf(status);
  const steps = [
    { key: "waiting", label: "Waiting" },
    { key: "confirming", label: "Detected" },
    { key: "confirmed", label: "Confirming" },
    { key: "finished", label: "Complete" },
  ];

  return (
    <div className="flex items-center gap-1 w-full">
      {steps.map((step) => {
        const stepIdx = STATUS_ORDER.indexOf(step.key);
        const isComplete = currentIdx >= stepIdx && currentIdx >= 0;
        const isCurrent = status === step.key || (step.key === "finished" && (status === "sending" || status === "finished"));
        return (
          <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full flex items-center">
              <div
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  isComplete ? "bg-positive" : "bg-white/10"
                )}
              />
            </div>
            <span
              className={cn(
                "text-[9px] font-bold uppercase tracking-wider",
                isCurrent ? "text-foreground" : isComplete ? "text-positive/60" : "text-muted-foreground/30"
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const PAY_CURRENCY = "usdttrc20";
const PAY_CURRENCY_DISPLAY = "USDT";

export default function SubscribePage() {
  const { user, isUserLoading } = useUser();
  const subscription = useSubscription(user?.uid, {
    name: user?.displayName,
    email: user?.email,
    photo: user?.photoURL,
  });

  const [step, setStep] = useState<Step>("select");
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [selectedDays, setSelectedDays] = useState<number>(90);
  const [isCreating, setIsCreating] = useState(false);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("waiting");
  const [copied, setCopied] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/subscription/plans")
      .then((r) => r.json())
      .then((data) => {
        if (data.plans?.length) setPlans(data.plans);
      })
      .catch(() => {});
  }, []);

  const handleCreatePayment = useCallback(async () => {
    if (!user) return;
    setIsCreating(true);

    try {
      const res = await fetch("/api/subscription/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          days: selectedDays,
          payCurrency: PAY_CURRENCY,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment");

      setPayment({
        paymentId: data.paymentId,
        payAddress: data.payAddress,
        payAmount: data.payAmount,
        payCurrency: data.payCurrency,
        priceAmountUsd: data.priceAmountUsd,
        orderId: data.orderId,
        expirationEstimate: data.expirationEstimate,
      });
      setPaymentStatus("waiting");
      setStep("paying");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Payment Error",
        description: error.message,
      });
    } finally {
      setIsCreating(false);
    }
  }, [user, selectedDays]);

  useEffect(() => {
    if (step !== "paying" || !payment) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/subscription/payment-status/${payment.paymentId}`);
        const data = await res.json();
        setPaymentStatus(data.status);

        if (data.status === "finished" || data.status === "sending") {
          setStep("success");
          if (pollRef.current) clearInterval(pollRef.current);
        }
        if (data.status === "failed" || data.status === "expired" || data.status === "refunded") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, payment]);

  const handleCopyAddress = useCallback(() => {
    if (!payment) return;
    navigator.clipboard.writeText(payment.payAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Address copied!" });
  }, [payment]);

  const handleCopyAmount = useCallback(() => {
    if (!payment) return;
    navigator.clipboard.writeText(String(payment.payAmount));
    toast({ title: "Amount copied!" });
  }, [payment]);

  if (isUserLoading || subscription.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Please sign in to subscribe.</p>
          <Link href="/" className="text-accent font-bold hover:underline">
            Go to home page
          </Link>
        </div>
      </div>
    );
  }

  const totalPrice = calculatePrice(selectedDays, plans);
  const networkWarning = getNetworkWarning(PAY_CURRENCY);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />

      <div className="max-w-xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Terminal
        </Link>

        <div className="space-y-1 mb-8">
          <h1 className="text-2xl font-black tracking-tight">
            Subscribe to TezTerminal
          </h1>
          <p className="text-sm text-muted-foreground">
            Unlock AI-powered trade signals, live updates, and Telegram alerts.
          </p>
        </div>

        {/* Step: Select Plan */}
        {step === "select" && (
          <div className="space-y-6">
            {/* Plan cards */}
            <div className="space-y-2">
              {plans.map((plan) => {
                const isSelected = selectedDays === plan.days;
                const perDay = (plan.price / plan.days).toFixed(2);

                return (
                  <button
                    key={plan.days}
                    type="button"
                    onClick={() => setSelectedDays(plan.days)}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-4 rounded-xl border transition-all cursor-pointer",
                      isSelected
                        ? "border-accent/50 bg-accent/[0.08] ring-1 ring-accent/20"
                        : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                      isSelected ? "border-accent" : "border-white/20"
                    )}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-accent" />}
                    </div>

                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-foreground">{plan.label}</span>
                        {plan.badge && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider leading-none",
                            plan.badge === "Best Value"
                              ? "bg-amber-500/90 text-black"
                              : "bg-accent/80 text-accent-foreground"
                          )}>
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground/50">
                        ${perDay}/day
                      </span>
                    </div>

                    <span className={cn(
                      "text-lg font-black tabular-nums shrink-0",
                      isSelected ? "text-accent" : "text-foreground"
                    )}>
                      ${plan.price}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Pay button */}
            <button
              onClick={handleCreatePayment}
              disabled={isCreating}
              className="w-full py-4 rounded-xl bg-accent text-accent-foreground text-sm font-black uppercase tracking-wider hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Payment...
                </span>
              ) : (
                `Pay $${totalPrice} USDT`
              )}
            </button>

            <p className="text-[11px] text-muted-foreground/40 text-center">
              Payment via USDT (TRC20 network)
            </p>

            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/40">
              <Shield className="w-3.5 h-3.5" />
              Secured by NOWPayments — Verified on blockchain
            </div>
          </div>
        )}

        {/* Step: Payment Screen */}
        {step === "paying" && payment && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    Order
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5 font-mono">
                    {payment.orderId}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    Amount
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    ${payment.priceAmountUsd} USD
                  </p>
                </div>
              </div>

              {/* Step-by-step payment guide */}
              <div className="space-y-5 mb-6">
                {/* Step 1: Amount */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-muted-foreground text-[10px] font-black flex items-center justify-center shrink-0">1</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Copy this amount</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                    <div>
                      <span className="text-2xl font-black text-foreground tabular-nums font-mono">
                        {payment.payAmount}
                      </span>
                      <span className="text-sm font-bold text-foreground/60 uppercase ml-2">
                        {PAY_CURRENCY_DISPLAY}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyAmount}
                      className="shrink-0 p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors cursor-pointer"
                      title="Copy amount"
                    >
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Step 2: Address */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-muted-foreground text-[10px] font-black flex items-center justify-center shrink-0">2</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Send to this address</span>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setQrExpanded(!qrExpanded)}
                      className="shrink-0 bg-white rounded-lg p-1 cursor-pointer hover:ring-2 hover:ring-white/30 transition-all"
                      title="Tap to expand QR"
                    >
                      <QRCodeSVG
                        value={payment.payAddress}
                        size={48}
                        level="M"
                        includeMargin={false}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-mono text-foreground/80 break-all leading-relaxed">
                        {payment.payAddress}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyAddress}
                      className="shrink-0 p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors cursor-pointer"
                      title="Copy address"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-positive" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  {qrExpanded && (
                    <div className="flex justify-center mt-3">
                      <button
                        type="button"
                        onClick={() => setQrExpanded(false)}
                        className="bg-white p-3 rounded-xl cursor-pointer hover:ring-2 hover:ring-white/30 transition-all"
                      >
                        <QRCodeSVG
                          value={payment.payAddress}
                          size={200}
                          level="M"
                          includeMargin={false}
                        />
                      </button>
                    </div>
                  )}
                  {networkWarning && (
                    <p className="mt-2 text-[11px] text-muted-foreground/70 leading-relaxed">
                      {networkWarning}
                    </p>
                  )}
                </div>

                {/* Step 3: Verify & send */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-muted-foreground text-[10px] font-black flex items-center justify-center shrink-0">3</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Verify &amp; send</span>
                  </div>
                  <p className="text-[12px] text-foreground/70 leading-relaxed mb-3">
                    Make sure the address receives <span className="font-bold text-foreground">{payment.payAmount} {PAY_CURRENCY_DISPLAY}</span>. If your exchange charges a withdrawal fee, <span className="font-semibold text-foreground underline">you must add it on top</span>.
                  </p>
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-3 space-y-1.5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Example</p>
                    <div className="text-[12px] text-foreground/60 leading-relaxed space-y-0.5">
                      <p>Required amount: <span className="font-bold text-foreground">{payment.payAmount}</span> USDT</p>
                      <p>Exchange withdrawal fee: <span className="font-bold text-foreground">1.00</span> USDT</p>
                      <div className="border-t border-white/[0.06] my-1.5" />
                      <p>You must enter: <span className="font-bold text-foreground">{(payment.payAmount + 1).toFixed(6)}</span> USDT in your exchange</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-negative/70 leading-relaxed">
                    If the address receives less than the required amount, the payment may fail and funds could be lost.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <StatusProgress status={paymentStatus} />

                <div className="flex items-center justify-center gap-2 py-3">
                  {(() => {
                    const s = STATUS_LABELS[paymentStatus] || STATUS_LABELS.waiting;
                    return (
                      <>
                        <span className="text-lg">{s.icon}</span>
                        <span className={cn("text-sm font-bold", s.color)}>
                          {s.label}
                        </span>
                      </>
                    );
                  })()}
                </div>

                {paymentStatus === "waiting" && (
                  <p className="text-[11px] text-muted-foreground/40 text-center">
                    Status updates automatically. Do not close this page until payment is detected.
                  </p>
                )}

                {(paymentStatus === "confirming" || paymentStatus === "confirmed") && (
                  <p className="text-[11px] text-muted-foreground/40 text-center">
                    Payment detected! Waiting for blockchain confirmations. This usually takes 2-5 minutes.
                  </p>
                )}

                {(paymentStatus === "failed" || paymentStatus === "expired") && (
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <p className="text-[12px] text-muted-foreground/50 text-center">
                      You can try again or create a new payment request.
                    </p>
                    <button
                      onClick={() => {
                        setPayment(null);
                        setPaymentStatus("waiting");
                        setStep("select");
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/15 border border-accent/25 text-accent text-xs font-bold uppercase tracking-wider hover:bg-accent/25 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/40">
              <Shield className="w-3.5 h-3.5" />
              Secured by NOWPayments — Transactions verified on blockchain
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === "success" && payment && (
          <div className="rounded-2xl border border-positive/20 bg-gradient-to-b from-positive/[0.06] to-transparent p-6 sm:p-8">
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-20 h-20 rounded-full bg-positive/10 border-2 border-positive/30 flex items-center justify-center">
                <Check className="w-10 h-10 text-positive" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tight text-positive">
                  Payment Successful!
                </h2>
                <p className="text-sm text-muted-foreground">
                  Your {selectedDays}-day subscription has been activated.
                </p>
              </div>

              <div className="w-full max-w-sm space-y-3 py-4 border-y border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground/60">Order</span>
                  <span className="text-[12px] font-bold font-mono">{payment.orderId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground/60">Days Added</span>
                  <span className="text-[12px] font-bold">{selectedDays} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground/60">Amount Paid</span>
                  <span className="text-[12px] font-bold">
                    {payment.payAmount} {PAY_CURRENCY_DISPLAY}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-400/[0.06] border border-blue-400/20 w-full max-w-sm">
                <Send className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-400/80 leading-relaxed text-left">
                  A confirmation has been sent to your Telegram. You&apos;ll also receive renewal reminders before your subscription expires.
                </p>
              </div>

              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground text-sm font-bold uppercase tracking-wider hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
              >
                <Sparkles className="w-4 h-4" />
                Go to Signals
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
