"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Gift,
  Loader2,
} from "lucide-react";
import { useUser } from "@/firebase";
import { fnoAffiliateHref, fnoLoginHref } from "@/lib/fnoninja/paths";
import { formatInr } from "@/lib/fnoninja/pricing";
import { FNO_CTA_GRADIENT, FNO_CTA_SHADOW, FNO_GRADIENT_TEXT_STYLE } from "@/lib/fnoninja/theme";
import type { AffiliateLadderTier } from "@/lib/fnoninja/affiliate-shared";

const FNO_BORDER = "rgba(90,140,220,0.2)";

type Dashboard = {
  enabled: boolean;
  referralCode: string;
  referralLink: string;
  ladder: AffiliateLadderTier[];
  currentTier: AffiliateLadderTier;
  nextTier: AffiliateLadderTier | null;
  lifetimeSalesInr: number;
  salesToNextTierInr: number;
  minPayoutInr: number;
  holdDays: number;
  tdsRate: number;
  tdsThresholdInr: number;
  stats: {
    totalReferred: number;
    loggedIn: number;
    trialActive: number;
    trialExpired: number;
    planSales: {
      daypass: { customers: number; salesInr: number };
      silver: { customers: number; salesInr: number };
      gold: { customers: number; salesInr: number };
    };
    heldInr: number;
    availableInr: number;
    lockedInr: number;
    paidInr: number;
    earnedInr: number;
    pendingSettlementInr: number;
  };
  kyc: { complete: false } | { complete: true; fullName: string; pan: string; bankAccountNumberMasked: string; ifsc: string };
  referred: { uid: string; displayName: string | null; email: string | null; joinedAt: string | null }[];
  commissions: {
    id: string;
    planTier: string;
    purchaseAmountInr: number;
    commissionRate: number;
    commissionAmountInr: number;
    status: string;
    holdUntil: string;
    createdAt: string;
  }[];
  payouts: {
    id: string;
    invoiceNumber: string;
    grossAmountInr: number;
    tdsAmountInr: number;
    netAmountInr: number;
    tdsApplied: boolean;
    status: string;
    createdAt: string;
    commissionCount: number;
  }[];
};

export function FnoNinjaAffiliatePage() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "kyc" | "payouts">("overview");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/fnoninja/affiliate/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      setData((await res.json()) as Dashboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isUserLoading && user) void load();
    if (!isUserLoading && !user) setLoading(false);
  }, [isUserLoading, user, load]);

  async function copyLink() {
    if (!data?.referralLink) return;
    await navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function requestPayout() {
    if (!user) return;
    setPayoutBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/fnoninja/affiliate/payout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Payout request failed");
      setTab("payouts");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payout failed");
    } finally {
      setPayoutBusy(false);
    }
  }

  async function downloadInvoice(payoutId: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/fnoninja/affiliate/payout/${payoutId}/invoice`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Could not download invoice");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "invoice.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(37,99,235,0.08)" }}
        >
          <Gift className="h-4 w-4 text-[#60a5fa]" />
        </span>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Refer & Earn</h1>
          <p className="text-[13px] text-slate-400">
            Earn 20–30% commission on paid FNO Ninja plans. Cash payout after TDS.
          </p>
        </div>
      </div>

      {isUserLoading || (user && loading) ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#60a5fa]" />
        </div>
      ) : !user ? (
        <Card>
          <p className="text-sm text-slate-300">Sign in to get your affiliate link and track earnings.</p>
          <Link
            href={fnoLoginHref(pathname, fnoAffiliateHref(pathname))}
            className="mt-4 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            Sign in
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          {data && !data.enabled ? (
            <Card>
              <p className="text-sm text-slate-300">The affiliate program is temporarily paused.</p>
            </Card>
          ) : null}

          {data ? (
            <>
              <div className="flex gap-2 border-b pb-2" style={{ borderColor: FNO_BORDER }}>
                {(
                  [
                    ["overview", "Overview"],
                    ["kyc", "Payout details"],
                    ["payouts", "Payouts"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      color: tab === id ? "#fff" : "#94a3b8",
                      backgroundColor: tab === id ? "rgba(37,99,235,0.25)" : "transparent",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "overview" ? (
                <Overview
                  data={data}
                  copied={copied}
                  onCopy={copyLink}
                  onRequestPayout={requestPayout}
                  payoutBusy={payoutBusy}
                />
              ) : null}
              {tab === "kyc" ? <KycForm user={user} kycComplete={data.kyc.complete} onSaved={load} /> : null}
              {tab === "payouts" ? (
                <PayoutsList payouts={data.payouts} onDownload={downloadInvoice} />
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Overview({
  data,
  copied,
  onCopy,
  onRequestPayout,
  payoutBusy,
}: {
  data: Dashboard;
  copied: boolean;
  onCopy: () => void;
  onRequestPayout: () => void;
  payoutBusy: boolean;
}) {
  const canPayout =
    data.kyc.complete && data.stats.availableInr >= data.minPayoutInr && !payoutBusy;
  const s = data.stats;
  const planSales = s.planSales ?? {
    daypass: { customers: 0, salesInr: 0 },
    silver: { customers: 0, salesInr: 0 },
    gold: { customers: 0, salesInr: 0 },
  };

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your link</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs text-[#93c5fd]">
            {data.referralLink}
          </code>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white"
            style={{ background: FNO_CTA_GRADIENT }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-[12px] text-slate-500">
          Friends can use code{" "}
          <span className="font-mono text-slate-300">{data.referralCode}</span> after Google
          sign-in for +3 trial days (10 total). Commission on net paid · {data.holdDays}-day hold ·
          TDS 194H {(data.tdsRate * 100).toFixed(0)}% above {formatInr(data.tdsThresholdInr)}/FY
        </p>
      </Card>

      <Card>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Your performance
            </p>
            <p className="mt-1 text-lg font-bold text-white">Referral funnel & earnings</p>
          </div>
          <p className="text-[12px] text-slate-500">
            Held {formatInr(s.heldInr)} · clears after {data.holdDays} days
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile label="Referred" value={String(s.totalReferred)} />
          <MetricTile label="Logged in" value={String(s.loggedIn ?? 0)} />
          <MetricTile label="Free trial active" value={String(s.trialActive ?? 0)} />
          <MetricTile label="Free trial expired" value={String(s.trialExpired ?? 0)} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <PlanSaleTile
            label="Day Pass sale"
            customers={planSales.daypass.customers}
            salesInr={planSales.daypass.salesInr}
          />
          <PlanSaleTile
            label="Silver plan sale"
            customers={planSales.silver.customers}
            salesInr={planSales.silver.salesInr}
          />
          <PlanSaleTile
            label="Gold plan sale"
            customers={planSales.gold.customers}
            salesInr={planSales.gold.salesInr}
          />
        </div>

        <div
          className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3"
          style={{ borderColor: FNO_BORDER }}
        >
          <MetricTile
            label="Total commission earned"
            value={formatInr(s.earnedInr)}
            emphasize
          />
          <MetricTile label="Settled to bank" value={formatInr(s.paidInr)} />
          <div
            className="rounded-xl px-3 py-3"
            style={{
              border: `1px solid ${FNO_BORDER}`,
              backgroundColor: "rgba(0,0,0,0.22)",
            }}
          >
            <p className="text-[11px] text-slate-500">Pending settlement</p>
            <p className="mt-1 text-base font-bold text-white">
              {formatInr(s.pendingSettlementInr ?? s.availableInr)}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Available {formatInr(s.availableInr)}
              {!data.kyc.complete ? " · Add PAN & bank first" : ""}
              {data.kyc.complete && s.availableInr < data.minPayoutInr
                ? ` · Min ${formatInr(data.minPayoutInr)}`
                : ""}
            </p>
            <button
              type="button"
              disabled={!canPayout}
              onClick={onRequestPayout}
              className="mt-2.5 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              style={{
                background: FNO_CTA_GRADIENT,
                boxShadow: canPayout ? FNO_CTA_SHADOW : undefined,
              }}
            >
              {payoutBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Settle now"}
            </button>
          </div>
        </div>

        <div className="mt-5 border-t pt-4" style={{ borderColor: FNO_BORDER }}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Recent commissions
          </p>
          {data.commissions.length === 0 ? (
            <p className="text-sm text-slate-400">
              No commissions yet. Share your link to start earning.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: FNO_BORDER }}>
              {data.commissions.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-xs"
                  style={{ borderColor: FNO_BORDER }}
                >
                  <div>
                    <p className="font-semibold capitalize text-white">
                      {c.planTier} · {formatInr(c.purchaseAmountInr)}
                    </p>
                    <p className="text-slate-500">
                      {(c.commissionRate * 100).toFixed(0)}% · {c.status}
                      {c.status === "held" ? ` until ${fmtDate(c.holdUntil)}` : ""}
                    </p>
                  </div>
                  <p className="font-bold text-[#93c5fd]">{formatInr(c.commissionAmountInr)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <LadderJourneyMap data={data} />
    </div>
  );
}

function MetricTile({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className="rounded-xl px-3 py-3"
      style={{
        border: `1px solid ${FNO_BORDER}`,
        backgroundColor: emphasize ? "rgba(37,99,235,0.12)" : "rgba(0,0,0,0.22)",
      }}
    >
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold text-white">{value}</p>
    </div>
  );
}

function PlanSaleTile({
  label,
  customers,
  salesInr,
}: {
  label: string;
  customers: number;
  salesInr: number;
}) {
  return (
    <div
      className="rounded-xl px-3 py-3"
      style={{
        border: `1px solid ${FNO_BORDER}`,
        backgroundColor: "rgba(0,0,0,0.22)",
      }}
    >
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">
        {customers} customer{customers === 1 ? "" : "s"}
      </p>
      <p className="text-[12px] font-semibold text-[#93c5fd]">{formatInr(salesInr)} sales</p>
    </div>
  );
}

function LadderJourneyMap({ data }: { data: Dashboard }) {
  const sorted = [...data.ladder].sort((a, b) => a.minSalesInr - b.minSalesInr);
  const currentIdx = Math.max(
    0,
    sorted.findIndex((t) => t.id === data.currentTier.id),
  );
  const next = data.nextTier;
  const segmentProgress =
    next && next.minSalesInr > data.currentTier.minSalesInr
      ? Math.min(
          1,
          Math.max(
            0,
            (data.lifetimeSalesInr - data.currentTier.minSalesInr) /
              (next.minSalesInr - data.currentTier.minSalesInr),
          ),
        )
      : currentIdx >= sorted.length - 1
        ? 1
        : 0;

  return (
    <Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Commission journey
          </p>
          <p className="mt-1 text-lg font-bold text-white">
            You&apos;re on {data.currentTier.label} · {(data.currentTier.rate * 100).toFixed(0)}%
            commission on sale
          </p>
        </div>
        <p
          className="text-base font-black tracking-tight sm:text-right sm:text-lg"
          style={FNO_GRADIENT_TEXT_STYLE}
        >
          Sell More Earn More
        </p>
      </div>

      {/* Desktop: horizontal path */}
      <div className="mt-6 hidden sm:block">
        <div className="relative px-1 pt-2 pb-1">
          {(() => {
            const steps = Math.max(1, sorted.length - 1);
            const fillPct = Math.min(100, ((currentIdx + segmentProgress) / steps) * 100);
            return (
              <>
                <div
                  className="absolute left-[10%] right-[10%] top-[22px] h-[3px] rounded-full"
                  style={{ backgroundColor: "rgba(90,140,220,0.15)" }}
                />
                <div
                  className="absolute left-[10%] top-[22px] h-[3px] rounded-full transition-all duration-500"
                  style={{
                    width: `calc(${fillPct}% * 0.8)`,
                    background: "linear-gradient(90deg, #1d4ed8, #60a5fa, #fbbf24)",
                    boxShadow: "0 0 12px rgba(96,165,250,0.35)",
                  }}
                />
              </>
            );
          })()}
          <div
            className="relative grid"
            style={{ gridTemplateColumns: `repeat(${sorted.length}, 1fr)` }}
          >
            {sorted.map((t, i) => {
              const state =
                i < currentIdx ? "done" : i === currentIdx ? "current" : "ahead";
              return (
                <JourneyNode
                  key={t.id}
                  tier={t}
                  state={state}
                  orientation="horizontal"
                  isLast={i === sorted.length - 1}
                />
              );
            })}
          </div>
        </div>
        {next ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>Progress to {next.label}</span>
              <span className="font-semibold text-[#93c5fd]">
                {Math.round(segmentProgress * 100)}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: "rgba(90,140,220,0.12)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(segmentProgress * 100)}%`,
                  background: "linear-gradient(90deg, #3b82f6, #fbbf24)",
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Mobile: vertical path */}
      <div className="mt-5 sm:hidden">
        <ol className="relative space-y-0">
          {sorted.map((t, i) => {
            const state =
              i < currentIdx ? "done" : i === currentIdx ? "current" : "ahead";
            const isLast = i === sorted.length - 1;
            return (
              <li key={t.id} className="relative flex gap-3 pb-5 last:pb-0">
                {!isLast ? (
                  <span
                    className="absolute left-[15px] top-8 bottom-0 w-[2px]"
                    style={{
                      background:
                        state === "done" || state === "current"
                          ? "linear-gradient(180deg, #60a5fa, rgba(251,191,36,0.5))"
                          : "rgba(90,140,220,0.15)",
                    }}
                  />
                ) : null}
                <JourneyNode tier={t} state={state} orientation="vertical" isLast={isLast} />
              </li>
            );
          })}
        </ol>
        {next ? (
          <p className="mt-1 text-[12px] text-slate-400">
            {formatInr(data.salesToNextTierInr)} more referred sales unlocks{" "}
            <span className="font-semibold text-[#fde68a]">
              {next.label} ({(next.rate * 100).toFixed(0)}%)
            </span>
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function JourneyNode({
  tier,
  state,
  orientation,
  isLast,
}: {
  tier: AffiliateLadderTier;
  state: "done" | "current" | "ahead";
  orientation: "horizontal" | "vertical";
  isLast: boolean;
}) {
  const rate = `${(tier.rate * 100).toFixed(0)}%`;
  const range =
    tier.maxSalesInr != null
      ? `${formatInr(tier.minSalesInr)} – ${formatInr(tier.maxSalesInr)}`
      : `${formatInr(tier.minSalesInr)}+`;

  const ring =
    state === "current"
      ? "rgba(251,191,36,0.95)"
      : state === "done"
        ? "rgba(96,165,250,0.9)"
        : "rgba(100,116,139,0.45)";
  const fill =
    state === "current"
      ? "radial-gradient(circle at 35% 30%, #fde68a 0%, #f59e0b 55%, #b45309 100%)"
      : state === "done"
        ? "radial-gradient(circle at 35% 30%, #93c5fd 0%, #3b82f6 60%, #1d4ed8 100%)"
        : "rgba(15,23,42,0.9)";

  if (orientation === "vertical") {
    return (
      <>
        <span
          className="relative z-[1] mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
          style={{
            border: `2px solid ${ring}`,
            background: fill,
            color: state === "ahead" ? "#64748b" : "#0f172a",
            boxShadow:
              state === "current" ? "0 0 16px rgba(251,191,36,0.45)" : undefined,
          }}
        >
          {rate}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <p
              className="text-sm font-bold"
              style={{ color: state === "ahead" ? "#64748b" : "#fff" }}
            >
              {tier.label}
            </p>
            {state === "current" ? (
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{
                  backgroundColor: "rgba(251,191,36,0.15)",
                  color: "#fde68a",
                  border: "1px solid rgba(251,191,36,0.35)",
                }}
              >
                You are here
              </span>
            ) : null}
            {state === "done" ? (
              <span className="text-[10px] font-semibold text-[#60a5fa]">Cleared</span>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-500">{range}</p>
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col items-center text-center px-1">
      <span
        className="relative z-[1] flex h-11 w-11 items-center justify-center rounded-full text-[11px] font-black"
        style={{
          border: `2.5px solid ${ring}`,
          background: fill,
          color: state === "ahead" ? "#64748b" : "#0f172a",
          boxShadow:
            state === "current"
              ? "0 0 18px rgba(251,191,36,0.5)"
              : state === "done"
                ? "0 0 10px rgba(59,130,246,0.35)"
                : undefined,
        }}
      >
        {rate}
      </span>
      <p
        className="mt-2 text-[12px] font-bold leading-tight"
        style={{ color: state === "ahead" ? "#64748b" : "#fff" }}
      >
        {tier.label}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{range}</p>
      {state === "current" ? (
        <span
          className="mt-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            backgroundColor: "rgba(251,191,36,0.15)",
            color: "#fde68a",
            border: "1px solid rgba(251,191,36,0.35)",
          }}
        >
          You are here
        </span>
      ) : null}
      {state === "done" && !isLast ? (
        <span className="mt-1 text-[9px] font-semibold text-[#60a5fa]">Cleared</span>
      ) : null}
    </div>
  );
}

function KycForm({
  user,
  kycComplete,
  onSaved,
}: {
  user: { getIdToken: () => Promise<string> };
  kycComplete: boolean;
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [pan, setPan] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/fnoninja/affiliate/kyc", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          pan,
          accountHolderName: accountHolderName || fullName,
          bankAccountNumber,
          ifsc,
          upiId: upiId || null,
          address,
          state,
          gstin: gstin || null,
          phone: phone || null,
          acceptTerms,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");
      setMsg("Payout details saved. You can request settlement from Overview.");
      await onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-sm font-semibold text-white">
        {kycComplete ? "Update payout details" : "Add PAN & bank for cash payout"}
      </p>
      <p className="mt-1 text-[12px] text-slate-400">
        Required for reverse (self-billing) invoice and TDS u/s 194H. We pay net amount to your bank
        after review.
      </p>
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Full name (as on PAN)" value={fullName} onChange={setFullName} required />
        <Field label="PAN" value={pan} onChange={setPan} required placeholder="ABCDE1234F" />
        <Field
          label="Account holder name"
          value={accountHolderName}
          onChange={setAccountHolderName}
          placeholder="Same as full name if blank"
        />
        <Field label="Bank account number" value={bankAccountNumber} onChange={setBankAccountNumber} required />
        <Field label="IFSC" value={ifsc} onChange={setIfsc} required placeholder="HDFC0001234" />
        <Field label="UPI (optional)" value={upiId} onChange={setUpiId} placeholder="name@upi" />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <Field label="State" value={state} onChange={setState} required />
        <div className="sm:col-span-2">
          <Field label="Address" value={address} onChange={setAddress} required />
        </div>
        <Field label="GSTIN (if registered)" value={gstin} onChange={setGstin} />
        <label className="sm:col-span-2 flex items-start gap-2 text-[12px] text-slate-300">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5"
            required
          />
          <span>
            I consent to FNO Ninja issuing self-billing reverse invoices on my behalf for referral
            commissions, agree that TDS may be deducted u/s 194H, and confirm the bank details are
            correct. No self-referrals. Commissions are on net paid amounts and may be reversed on
            refunds.
          </span>
        </label>
        {err ? <p className="sm:col-span-2 text-sm text-red-300">{err}</p> : null}
        {msg ? <p className="sm:col-span-2 text-sm text-emerald-300">{msg}</p> : null}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: FNO_CTA_GRADIENT, boxShadow: FNO_CTA_SHADOW }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save details"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PayoutsList({
  payouts,
  onDownload,
}: {
  payouts: Dashboard["payouts"];
  onDownload: (id: string) => void;
}) {
  if (payouts.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-400">No payouts yet. Request settlement from Overview when available.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="divide-y" style={{ borderColor: FNO_BORDER }}>
        {payouts.map((p) => (
          <div
            key={p.id}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: FNO_BORDER }}
          >
            <div>
              <p className="text-sm font-semibold text-white">{p.invoiceNumber}</p>
              <p className="text-[12px] text-slate-400">
                {fmtDate(p.createdAt)} · {p.commissionCount} sale{p.commissionCount === 1 ? "" : "s"} ·{" "}
                {p.status.replace("_", " ")}
                {p.tdsApplied ? ` · TDS ${formatInr(p.tdsAmountInr)}` : " · No TDS"}
              </p>
              <p className="text-[12px] text-slate-300">
                Gross {formatInr(p.grossAmountInr)} → Net {formatInr(p.netAmountInr)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDownload(p.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-[#93c5fd]"
              style={{ borderColor: FNO_BORDER }}
            >
              <Download className="h-3.5 w-3.5" />
              Reverse invoice
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ border: `1px solid ${FNO_BORDER}`, backgroundColor: "rgba(13,27,46,0.85)" }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-[11px] font-semibold text-slate-400">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#60a5fa]"
        style={{ borderColor: FNO_BORDER }}
      />
    </label>
  );
}

function fmtDate(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
