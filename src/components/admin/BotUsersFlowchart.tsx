"use client";

import { cn } from "@/lib/utils";
import { formatUsdtHeadline } from "@/components/admin/AdminStatCard";
import type { ExchangeSegmentMetrics } from "@/lib/freedombot/platform-summary";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

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
  | "new_account"
  | "awaiting_profits"
  | "no_closed_trades"
  | "active_profitable"
  | "active_awaiting"
  | "active_awaiting_over_30d"
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
  everDeployedInPnl: number;
  profitableUsers: number;
  newAccountUsers: number;
  awaitingProfitsUsers: number;
  noClosedTradesUsers: number;
  activeProfitable: number;
  activeAwaiting: number;
  activeAwaitingOver30Days: number;
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

const LIFECYCLE_COLORS = {
  never_deployed: "#fbbf24",
  churned: "#f43f5e",
  has_bot_now: "#34d399",
} as const;

const PNL_COLORS = {
  profitable: "#34d399",
  new_account: "#71717a",
  awaiting: "#f43f5e",
} as const;

type DonutSlice = {
  key: BotUsersSegmentFilter;
  name: string;
  value: number;
  color: string;
};

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#161618] to-[#101012] p-4 shadow-lg shadow-black/20",
        className,
      )}
    >
      <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/45 mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  className,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-xl border text-left transition-all",
        onClick && "cursor-pointer hover:brightness-110",
        active ? "border-accent/50 ring-1 ring-accent/25" : "border-white/[0.06]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

function MiniDonut({
  slices,
  centerLabel,
  centerValue,
  loading,
  activeKey,
  onSliceClick,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  loading: boolean;
  activeKey: BotUsersSegmentFilter;
  onSliceClick: (key: BotUsersSegmentFilter) => void;
}) {
  const filtered = slices.filter((s) => s.value > 0);
  const data = filtered.length > 0 ? filtered : [{ key: null, name: "—", value: 1, color: "#27272a" }];

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[120px] w-[120px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={38}
              outerRadius={54}
              paddingAngle={filtered.length > 1 ? 2 : 0}
              stroke="none"
              onClick={(_, index) => {
                const slice = filtered[index];
                if (slice?.key) onSliceClick(slice.key);
              }}
            >
              {data.map((entry, i) => (
                <Cell
                  key={`${entry.name}-${i}`}
                  fill={entry.color}
                  className={entry.key ? "cursor-pointer outline-none" : undefined}
                  opacity={
                    activeKey && entry.key && activeKey !== entry.key ? 0.45 : 1
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">
            {centerLabel}
          </span>
          <span className="text-xl font-black font-mono text-white leading-none mt-0.5">
            {loading ? "…" : centerValue}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {slices.map((slice) => (
          <SegmentButton
            key={slice.key ?? slice.name}
            active={activeKey === slice.key}
            onClick={slice.key ? () => onSliceClick(slice.key!) : undefined}
            className="w-full px-2.5 py-1.5 bg-white/[0.02]"
            title={slice.name}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-[10px] font-semibold text-muted-foreground truncate">
                  {slice.name}
                </span>
              </div>
              <span className="text-sm font-black font-mono text-white shrink-0">
                {loading ? "…" : slice.value}
              </span>
            </div>
          </SegmentButton>
        ))}
      </div>
    </div>
  );
}

function ActivityBars({
  items,
  loading,
  activeKey,
  onItemClick,
}: {
  items: { key: BotUsersSegmentFilter; label: string; value: number; color: string }[];
  loading: boolean;
  activeKey: BotUsersSegmentFilter;
  onItemClick: (key: BotUsersSegmentFilter) => void;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <SegmentButton
          key={item.key}
          active={activeKey === item.key}
          onClick={() => onItemClick(item.key)}
          className="w-full p-2.5 bg-white/[0.02]"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {item.label}
            </span>
            <span className="text-lg font-black font-mono" style={{ color: item.color }}>
              {loading ? "…" : item.value}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
                opacity: item.value === 0 ? 0.25 : 1,
              }}
            />
          </div>
        </SegmentButton>
      ))}
    </div>
  );
}

function CrossCard({
  label,
  value,
  loading,
  active,
  onClick,
  variant,
}: {
  label: string;
  value: number;
  loading: boolean;
  active: boolean;
  onClick: () => void;
  variant: "active-profit" | "active-await" | "active-30d" | "paused-profit" | "paused-await";
}) {
  const styles: Record<typeof variant, string> = {
    "active-profit":
      "bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent",
    "active-await":
      "bg-gradient-to-br from-amber-500/25 via-orange-500/10 to-transparent",
    "active-30d":
      "bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent",
    "paused-profit":
      "bg-gradient-to-br from-emerald-500/10 via-white/[0.03] to-transparent",
    "paused-await":
      "bg-gradient-to-br from-rose-500/15 via-amber-500/5 to-transparent",
  };

  const valueColors: Record<typeof variant, string> = {
    "active-profit": "text-emerald-400",
    "active-await": "text-amber-300",
    "active-30d": "text-orange-300",
    "paused-profit": "text-emerald-400/80",
    "paused-await": "text-rose-300",
  };

  return (
    <SegmentButton
      active={active}
      onClick={onClick}
      className={cn("p-4 min-h-[88px]", styles[variant])}
    >
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/55 block">
        {label}
      </span>
      <span className={cn("text-3xl font-black font-mono block mt-2", valueColors[variant])}>
        {loading ? "…" : value}
      </span>
    </SegmentButton>
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

  const lifecycleSlices: DonutSlice[] = [
    {
      key: "never_deployed",
      name: "Never deployed",
      value: metrics?.neverDeployed ?? 0,
      color: LIFECYCLE_COLORS.never_deployed,
    },
    {
      key: "churned",
      name: "Churned",
      value: metrics?.churned ?? 0,
      color: LIFECYCLE_COLORS.churned,
    },
    {
      key: "has_bot_now",
      name: "Has bot now",
      value: metrics?.hasBotNow ?? 0,
      color: LIFECYCLE_COLORS.has_bot_now,
    },
  ];

  const pnlSlices: DonutSlice[] = [
    {
      key: "profitable",
      name: "Profitable",
      value: metrics?.profitableUsers ?? 0,
      color: PNL_COLORS.profitable,
    },
    {
      key: "new_account",
      name: "New account",
      value: metrics?.newAccountUsers ?? 0,
      color: PNL_COLORS.new_account,
    },
    {
      key: "awaiting_profits",
      name: "Awaiting profits",
      value: metrics?.awaitingProfitsUsers ?? 0,
      color: PNL_COLORS.awaiting,
    },
  ];

  const totalCapital = metrics?.totalCapitalUsdt ?? 0;

  return (
    <div className="space-y-4">
      {/* Row 1 — lifecycle · activity · PnL */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Lifecycle — mutually exclusive">
          <MiniDonut
            slices={lifecycleSlices}
            centerLabel="Sign ups"
            centerValue={v(metrics?.totalUsers)}
            loading={loading}
            activeKey={segmentFilter}
            onSliceClick={toggle}
          />
        </Panel>

        <Panel title="Activity — can overlap">
          <ActivityBars
            loading={loading}
            activeKey={segmentFilter}
            onItemClick={toggle}
            items={[
              {
                key: "active_users",
                label: "Active",
                value: metrics?.activeUsers ?? 0,
                color: "#34d399",
              },
              {
                key: "paused_users",
                label: "Paused",
                value: metrics?.pausedUsers ?? 0,
                color: "#fbbf24",
              },
              {
                key: "stopped_users",
                label: "Stopped",
                value: metrics?.stoppedUsers ?? 0,
                color: "#71717a",
              },
            ]}
          />
        </Panel>

        <Panel title="PnL — ever deployed">
          <MiniDonut
            slices={pnlSlices}
            centerLabel="Ever deployed"
            centerValue={v(metrics?.everDeployedInPnl)}
            loading={loading}
            activeKey={segmentFilter}
            onSliceClick={toggle}
          />
        </Panel>
      </div>

      {/* Row 2 — cross matrix · exchanges */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Activity × PnL">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <CrossCard
              label="Active + Profitable"
              value={metrics?.activeProfitable ?? 0}
              loading={loading}
              active={segmentFilter === "active_profitable"}
              onClick={() => toggle("active_profitable")}
              variant="active-profit"
            />
            <CrossCard
              label="Active + Awaiting"
              value={metrics?.activeAwaiting ?? 0}
              loading={loading}
              active={segmentFilter === "active_awaiting"}
              onClick={() => toggle("active_awaiting")}
              variant="active-await"
            />
            <CrossCard
              label="Active >30d awaiting"
              value={metrics?.activeAwaitingOver30Days ?? 0}
              loading={loading}
              active={segmentFilter === "active_awaiting_over_30d"}
              onClick={() => toggle("active_awaiting_over_30d")}
              variant="active-30d"
            />
            <CrossCard
              label="Paused + Profitable"
              value={metrics?.pausedProfitable ?? 0}
              loading={loading}
              active={segmentFilter === "paused_profitable"}
              onClick={() => toggle("paused_profitable")}
              variant="paused-profit"
            />
            <CrossCard
              label="Paused + Awaiting"
              value={metrics?.pausedAwaiting ?? 0}
              loading={loading}
              active={segmentFilter === "paused_awaiting"}
              onClick={() => toggle("paused_awaiting")}
              variant="paused-await"
            />
          </div>
        </Panel>

        <Panel title="Exchange — deployments &amp; capital">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(metrics?.exchanges ?? []).map((ex) => {
              const capitalPct =
                totalCapital > 0 ? Math.round((ex.capitalUsdt / totalCapital) * 100) : 0;
              return (
                <div key={ex.exchange} className="space-y-2">
                  <SegmentButton
                    active={segmentFilter === exchangeFilterKey(ex.exchange)}
                    onClick={() => toggle(exchangeFilterKey(ex.exchange))}
                    className="w-full p-3 bg-white/[0.02]"
                  >
                    <div className="text-xs font-black uppercase tracking-wide text-white mb-2">
                      {EXCHANGE_LABELS[ex.exchange] ?? ex.exchange}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]">
                      <div>
                        <span className="text-muted-foreground/50">Users </span>
                        <span className="font-mono font-bold text-white">{v(ex.usersWithDeployment)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/50">Active </span>
                        <span className="font-mono font-bold text-emerald-400">{v(ex.activeDeployments)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/50">Paused </span>
                        <span className="font-mono font-bold text-amber-400">{v(ex.pausedDeployments)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/50">Awaiting </span>
                        <span className="font-mono font-bold text-rose-400">{v(ex.awaitingUsers)}</span>
                      </div>
                    </div>
                  </SegmentButton>
                  <SegmentButton
                    active={segmentFilter === exchangeCapitalKey(ex.exchange)}
                    onClick={() => toggle(exchangeCapitalKey(ex.exchange))}
                    className="w-full p-3 bg-sky-500/[0.06] border-sky-500/15"
                  >
                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
                      Capital
                    </span>
                    <span className="text-base font-black font-mono text-sky-400 block">
                      {usdt(ex.capitalUsdt)}
                    </span>
                    <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${capitalPct}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/40 mt-1 block">
                      {capitalPct}% of platform
                    </span>
                  </SegmentButton>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Footer strip */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-r from-[#141416] via-[#121214] to-[#141416] px-5 py-4">
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-3">
          Platform totals
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <SegmentButton
            active={segmentFilter === "sign_ups"}
            onClick={() => toggle("sign_ups")}
            className="px-3 py-2 bg-white/[0.02]"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Total users
            </span>
            <span className="text-xl font-black font-mono text-white block">{v(metrics?.totalUsers)}</span>
          </SegmentButton>
          <SegmentButton
            active={segmentFilter === "active_deployments"}
            onClick={() => toggle("active_deployments")}
            className="px-3 py-2 bg-white/[0.02]"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Active bots
            </span>
            <span className="text-xl font-black font-mono text-emerald-400 block">
              {v(metrics?.activeDeployments)}
            </span>
          </SegmentButton>
          <SegmentButton
            active={segmentFilter === "capital"}
            onClick={() => toggle("capital")}
            className="px-3 py-2 bg-white/[0.02]"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Total capital
            </span>
            <span className="text-xl font-black font-mono text-sky-400 block">
              {usdt(metrics?.totalCapitalUsdt)}
            </span>
          </SegmentButton>
          <SegmentButton
            active={segmentFilter === "volume"}
            onClick={() => toggle("volume")}
            className="px-3 py-2 bg-white/[0.02]"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Volume traded
            </span>
            <span className="text-xl font-black font-mono text-white block">
              {usdt(metrics?.totalVolumeUsdt)}
            </span>
          </SegmentButton>
          <SegmentButton
            active={segmentFilter === "profit"}
            onClick={() => toggle("profit")}
            className="px-3 py-2 bg-white/[0.02]"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Lifetime profit
            </span>
            <span
              className={cn(
                "text-xl font-black font-mono block",
                (metrics?.totalProfitUsdt ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {usdt(metrics?.totalProfitUsdt)}
            </span>
          </SegmentButton>
        </div>
      </div>
    </div>
  );
}
