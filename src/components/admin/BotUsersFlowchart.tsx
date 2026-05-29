"use client";

import { cn } from "@/lib/utils";
import { formatUsdtHeadline } from "@/components/admin/AdminStatCard";
import type { ExchangeSegmentMetrics } from "@/lib/freedombot/platform-summary";

export type BotUsersSegmentFilter =
  | null
  | "sign_ups"
  | "never_deployed"
  | "churned"
  | "has_bot_now"
  | "active_users"
  | "paused_users"
  | "stopped_users"
  | "profitable"
  | "awaiting_profits"
  | "no_closed_trades"
  | "active_profitable"
  | "active_awaiting"
  | "paused_profitable"
  | "paused_awaiting"
  | "exchange_bybit"
  | "exchange_coindcx"
  | "exchange_hyperliquid"
  | "exchange_capital_bybit"
  | "exchange_capital_coindcx"
  | "exchange_capital_hyperliquid"
  | "capital"
  | "volume"
  | "profit"
  | "all_deployments"
  | "active_deployments";

export interface FlowchartMetrics {
  totalUsers: number;
  neverDeployed: number;
  churned: number;
  hasBotNow: number;
  activeUsers: number;
  pausedUsers: number;
  stoppedUsers: number;
  everDeployedWithTrades: number;
  profitableUsers: number;
  awaitingProfitsUsers: number;
  noClosedTradesUsers: number;
  activeProfitable: number;
  activeAwaiting: number;
  pausedProfitable: number;
  pausedAwaiting: number;
  totalCapitalUsdt: number;
  totalVolumeUsdt: number;
  totalProfitUsdt: number;
  totalDeployments: number;
  activeDeployments: number;
  exchanges: ExchangeSegmentMetrics[];
}

const EXCHANGE_LABELS: Record<string, string> = {
  BYBIT: "Bybit",
  COINDCX: "CoinDCX",
  HYPERLIQUID: "Hyperliquid",
};

function FlowNode({
  label,
  hint,
  value,
  sublabel,
  active,
  onClick,
  valueClassName,
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  sublabel?: string;
  active?: boolean;
  onClick?: () => void;
  valueClassName?: string;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={hint}
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition-colors min-w-[140px]",
        "bg-gradient-to-b from-[#141416] to-[#0f0f11]",
        onClick && "hover:border-accent/30 cursor-pointer",
        active ? "border-accent/40 ring-1 ring-accent/20" : "border-white/[0.06]",
        className,
      )}
    >
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
        {label}
      </span>
      <span
        className={cn(
          "text-xl font-black font-mono block mt-1",
          valueClassName ?? "text-white",
        )}
      >
        {value}
      </span>
      {sublabel ? (
        <span className="text-[10px] text-muted-foreground/60 block mt-1">{sublabel}</span>
      ) : null}
    </Comp>
  );
}

function FlowArrow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center text-accent/40 shrink-0",
        className,
      )}
      aria-hidden
    >
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
        <path d="M0 8h18M18 8l-5-5M18 8l-5 5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mb-3">
      {children}
    </div>
  );
}

export function BotUsersFlowchart({
  metrics,
  loading,
  segmentFilter,
  onSegmentClick,
}: {
  metrics: FlowchartMetrics | undefined;
  loading: boolean;
  segmentFilter: BotUsersSegmentFilter;
  onSegmentClick: (segment: BotUsersSegmentFilter) => void;
}) {
  const v = (n: number | undefined) => (loading ? "…" : String(n ?? 0));
  const usdt = (n: number | undefined) => (loading ? "…" : formatUsdtHeadline(n ?? 0));

  const toggle = (segment: BotUsersSegmentFilter) => {
    onSegmentClick(segmentFilter === segment ? null : segment);
  };

  const exchangeFilterKey = (exchange: string): BotUsersSegmentFilter => {
    const key = exchange.toLowerCase();
    if (key === "bybit") return "exchange_bybit";
    if (key === "coindcx") return "exchange_coindcx";
    return "exchange_hyperliquid";
  };

  const exchangeCapitalKey = (exchange: string): BotUsersSegmentFilter => {
    const key = exchange.toLowerCase();
    if (key === "bybit") return "exchange_capital_bybit";
    if (key === "coindcx") return "exchange_capital_coindcx";
    return "exchange_capital_hyperliquid";
  };

  return (
    <div className="space-y-8">
      {/* ① Lifecycle */}
      <section>
        <SectionLabel>① Lifecycle — mutually exclusive</SectionLabel>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-2 overflow-x-auto pb-1">
          <FlowNode
            label="Sign ups"
            hint="All Firestore user accounts"
            value={v(metrics?.totalUsers)}
            sublabel="All accounts"
            active={segmentFilter === "sign_ups"}
            onClick={() => toggle("sign_ups")}
          />
          <FlowArrow className="hidden lg:flex rotate-0" />
          <div className="flex flex-col sm:flex-row gap-3 lg:gap-2">
            <FlowNode
              label="Never deployed"
              hint="No bot ever, no closed trades in scope"
              value={v(metrics?.neverDeployed)}
              active={segmentFilter === "never_deployed"}
              onClick={() => toggle("never_deployed")}
            />
            <FlowNode
              label="Churned"
              hint="Ever deployed, zero bots today"
              value={v(metrics?.churned)}
              sublabel="No bot now"
              active={segmentFilter === "churned"}
              onClick={() => toggle("churned")}
            />
            <FlowNode
              label="Has bot now"
              hint="≥1 current deployment in scope"
              value={v(metrics?.hasBotNow)}
              active={segmentFilter === "has_bot_now"}
              onClick={() => toggle("has_bot_now")}
              valueClassName="text-sky-400"
            />
          </div>
        </div>
      </section>

      {/* ② Activity */}
      <section>
        <SectionLabel>② Activity — can overlap (has bot now)</SectionLabel>
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          <FlowNode
            label="Has bot now"
            value={v(metrics?.hasBotNow)}
            className="opacity-60 pointer-events-none"
          />
          <FlowArrow className="hidden sm:flex" />
          <div className="flex flex-col sm:flex-row gap-3">
            <FlowNode
              label="Active ≥1"
              hint="status = active"
              value={v(metrics?.activeUsers)}
              active={segmentFilter === "active_users"}
              onClick={() => toggle("active_users")}
              valueClassName="text-emerald-400"
            />
            <FlowNode
              label="Paused ≥1"
              hint="status = paused"
              value={v(metrics?.pausedUsers)}
              active={segmentFilter === "paused_users"}
              onClick={() => toggle("paused_users")}
              valueClassName="text-amber-400"
            />
            <FlowNode
              label="Stopped ≥1"
              hint="status = stopped"
              value={v(metrics?.stoppedUsers)}
              active={segmentFilter === "stopped_users"}
              onClick={() => toggle("stopped_users")}
            />
          </div>
        </div>
      </section>

      {/* ③ PnL */}
      <section>
        <SectionLabel>③ PnL — closed production trades</SectionLabel>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-2 overflow-x-auto pb-1">
          <FlowNode
            label="Ever traded"
            hint="Users with ≥1 closed trade in scope"
            value={v(metrics?.everDeployedWithTrades)}
            className="opacity-80"
          />
          <FlowArrow className="hidden lg:flex" />
          <div className="flex flex-col sm:flex-row gap-3">
            <FlowNode
              label="Profitable"
              hint="Net lifetime PnL > 0"
              value={v(metrics?.profitableUsers)}
              active={segmentFilter === "profitable"}
              onClick={() => toggle("profitable")}
              valueClassName="text-emerald-400"
            />
            <FlowNode
              label="Awaiting profits"
              hint="Net lifetime PnL < 0"
              value={v(metrics?.awaitingProfitsUsers)}
              active={segmentFilter === "awaiting_profits"}
              onClick={() => toggle("awaiting_profits")}
              valueClassName="text-rose-400"
            />
            <FlowNode
              label="No closed trades"
              hint="Deployed in scope but never closed a trade"
              value={v(metrics?.noClosedTradesUsers)}
              active={segmentFilter === "no_closed_trades"}
              onClick={() => toggle("no_closed_trades")}
            />
          </div>
        </div>
      </section>

      {/* ④ Activity × PnL */}
      <section>
        <SectionLabel>④ Activity × PnL</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FlowNode
            label="Active + Profitable"
            value={v(metrics?.activeProfitable)}
            active={segmentFilter === "active_profitable"}
            onClick={() => toggle("active_profitable")}
            valueClassName="text-emerald-400"
          />
          <FlowNode
            label="Active + Awaiting"
            value={v(metrics?.activeAwaiting)}
            active={segmentFilter === "active_awaiting"}
            onClick={() => toggle("active_awaiting")}
            valueClassName="text-rose-400"
          />
          <FlowNode
            label="Paused + Profitable"
            value={v(metrics?.pausedProfitable)}
            active={segmentFilter === "paused_profitable"}
            onClick={() => toggle("paused_profitable")}
            valueClassName="text-emerald-400"
          />
          <FlowNode
            label="Paused + Awaiting"
            value={v(metrics?.pausedAwaiting)}
            active={segmentFilter === "paused_awaiting"}
            onClick={() => toggle("paused_awaiting")}
            valueClassName="text-rose-400"
          />
        </div>
      </section>

      {/* ⑤ Exchange */}
      <section>
        <SectionLabel>⑤ Exchange — deployments &amp; capital</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(metrics?.exchanges ?? []).map((ex) => (
            <div
              key={ex.exchange}
              className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4 space-y-3"
            >
              <button
                type="button"
                onClick={() => toggle(exchangeFilterKey(ex.exchange))}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                  segmentFilter === exchangeFilterKey(ex.exchange)
                    ? "border-accent/40 ring-1 ring-accent/20"
                    : "border-white/[0.06] hover:border-accent/20",
                )}
              >
                <span className="text-sm font-black text-white uppercase tracking-wide">
                  {EXCHANGE_LABELS[ex.exchange] ?? ex.exchange}
                </span>
                <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                  <div>
                    <span className="text-muted-foreground/50 block">Users</span>
                    <span className="font-mono font-bold text-white">{v(ex.usersWithDeployment)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50 block">Active bots</span>
                    <span className="font-mono font-bold text-emerald-400">{v(ex.activeDeployments)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50 block">Paused</span>
                    <span className="font-mono font-bold text-amber-400">{v(ex.pausedDeployments)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50 block">Stopped</span>
                    <span className="font-mono font-bold">{v(ex.stoppedDeployments)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50 block">Profitable</span>
                    <span className="font-mono font-bold text-emerald-400">{v(ex.profitableUsers)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50 block">Awaiting</span>
                    <span className="font-mono font-bold text-rose-400">{v(ex.awaitingUsers)}</span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => toggle(exchangeCapitalKey(ex.exchange))}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                  segmentFilter === exchangeCapitalKey(ex.exchange)
                    ? "border-sky-400/40 ring-1 ring-sky-400/20"
                    : "border-white/[0.06] hover:border-sky-400/20",
                )}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Capital (active wallets)
                </span>
                <span className="text-lg font-black font-mono text-sky-400 block mt-1">
                  {usdt(ex.capitalUsdt)}
                </span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Platform totals */}
      <section>
        <SectionLabel>Platform totals</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <FlowNode
            label="Total capital"
            value={usdt(metrics?.totalCapitalUsdt)}
            sublabel="Active · deduped wallet"
            active={segmentFilter === "capital"}
            onClick={() => toggle("capital")}
            valueClassName="text-sky-400"
          />
          <FlowNode
            label="Volume traded"
            value={usdt(metrics?.totalVolumeUsdt)}
            sublabel="Closed notional"
            active={segmentFilter === "volume"}
            onClick={() => toggle("volume")}
          />
          <FlowNode
            label="Profit (lifetime)"
            value={usdt(metrics?.totalProfitUsdt)}
            sublabel="Realized · production"
            active={segmentFilter === "profit"}
            onClick={() => toggle("profit")}
            valueClassName={
              (metrics?.totalProfitUsdt ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
            }
          />
          <FlowNode
            label="Deployments"
            value={v(metrics?.totalDeployments)}
            active={segmentFilter === "all_deployments"}
            onClick={() => toggle("all_deployments")}
          />
          <FlowNode
            label="Active deployments"
            value={v(metrics?.activeDeployments)}
            active={segmentFilter === "active_deployments"}
            onClick={() => toggle("active_deployments")}
            valueClassName="text-emerald-400"
          />
        </div>
      </section>
    </div>
  );
}
