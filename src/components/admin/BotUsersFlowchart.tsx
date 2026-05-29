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

/** Top-row panels sit in a container at 70% page width (30% narrower than full thirds). */
const TOP_ROW = "w-full xl:w-[70%] grid grid-cols-1 md:grid-cols-3 gap-4";

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
  layout = "horizontal",
  size = "md",
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  loading: boolean;
  activeKey: BotUsersSegmentFilter;
  onSliceClick: (key: BotUsersSegmentFilter) => void;
  layout?: "horizontal" | "vertical";
  size?: "md" | "lg";
}) {
  const filtered = slices.filter((s) => s.value > 0);
  const data = filtered.length > 0 ? filtered : [{ key: null, name: "—", value: 1, color: "#27272a" }];

  const chartPx = size === "lg" ? 148 : 120;
  const innerR = size === "lg" ? 46 : 38;
  const outerR = size === "lg" ? 66 : 54;

  const chart = (
    <div
      className="relative shrink-0 mx-auto"
      style={{ width: chartPx, height: chartPx }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={innerR}
            outerRadius={outerR}
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
                opacity={activeKey && entry.key && activeKey !== entry.key ? 0.45 : 1}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center px-1">
          {centerLabel}
        </span>
        <span
          className={cn(
            "font-black font-mono text-white leading-none mt-0.5",
            size === "lg" ? "text-2xl" : "text-xl",
          )}
        >
          {loading ? "…" : centerValue}
        </span>
      </div>
    </div>
  );

  const legend = (
    <div className={cn("min-w-0", layout === "vertical" ? "w-full space-y-2.5" : "flex-1 space-y-2")}>
      {slices.map((slice) => (
        <SegmentButton
          key={slice.key ?? slice.name}
          active={activeKey === slice.key}
          onClick={slice.key ? () => onSliceClick(slice.key!) : undefined}
          className={cn(
            "w-full bg-white/[0.02]",
            layout === "vertical" ? "px-3 py-2.5" : "px-2.5 py-1.5",
          )}
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
  );

  if (layout === "vertical") {
    return (
      <div className="flex flex-col items-stretch gap-5 py-1">
        {chart}
        {legend}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {chart}
      {legend}
    </div>
  );
}

function ActivityBars({
  items,
  loading,
  activeKey,
  onItemClick,
  tall,
}: {
  items: { key: BotUsersSegmentFilter; label: string; value: number; color: string }[];
  loading: boolean;
  activeKey: BotUsersSegmentFilter;
  onItemClick: (key: BotUsersSegmentFilter) => void;
  tall?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className={cn("flex flex-col justify-between", tall ? "gap-5 min-h-[240px] py-1" : "space-y-3")}>
      {items.map((item) => (
        <SegmentButton
          key={item.key}
          active={activeKey === item.key}
          onClick={() => onItemClick(item.key)}
          className={cn("w-full bg-white/[0.02]", tall ? "p-3.5 flex-1" : "p-2.5")}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {item.label}
            </span>
            <span className="text-lg font-black font-mono" style={{ color: item.color }}>
              {loading ? "…" : item.value}
            </span>
          </div>
          <div className={cn("rounded-full bg-white/[0.04] overflow-hidden", tall ? "h-2.5" : "h-2")}>
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

function ExchangePanelContent({
  exchanges,
  totalCapital,
  loading,
  segmentFilter,
  onToggle,
  v,
  usdt,
  exchangeFilterKey,
  exchangeCapitalKey,
}: {
  exchanges: ExchangeSegmentMetrics[];
  totalCapital: number;
  loading: boolean;
  segmentFilter: BotUsersSegmentFilter;
  onToggle: (segment: BotUsersSegmentFilter) => void;
  v: (n: number | undefined) => string;
  usdt: (n: number | undefined) => string;
  exchangeFilterKey: (exchange: string) => BotUsersSegmentFilter;
  exchangeCapitalKey: (exchange: string) => BotUsersSegmentFilter;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {exchanges.map((ex) => {
        const capitalPct =
          totalCapital > 0 ? Math.round((ex.capitalUsdt / totalCapital) * 100) : 0;
        return (
          <div key={ex.exchange} className="space-y-2">
            <SegmentButton
              active={segmentFilter === exchangeFilterKey(ex.exchange)}
              onClick={() => onToggle(exchangeFilterKey(ex.exchange))}
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
              onClick={() => onToggle(exchangeCapitalKey(ex.exchange))}
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
  );
}

function PlatformTotalsContent({
  metrics,
  loading,
  segmentFilter,
  onToggle,
  v,
  usdt,
}: {
  metrics: FlowchartMetrics | undefined;
  loading: boolean;
  segmentFilter: BotUsersSegmentFilter;
  onToggle: (segment: BotUsersSegmentFilter) => void;
  v: (n: number | undefined) => string;
  usdt: (n: number | undefined) => string;
}) {
  const items: {
    key: BotUsersSegmentFilter;
    label: string;
    value: string;
    valueClassName?: string;
    accent?: boolean;
  }[] = [
    {
      key: "sign_ups",
      label: "Total users",
      value: v(metrics?.totalUsers),
    },
    {
      key: "active_deployments",
      label: "Active bots",
      value: v(metrics?.activeDeployments),
      valueClassName: "text-emerald-400",
    },
    {
      key: "capital",
      label: "Total capital",
      value: usdt(metrics?.totalCapitalUsdt),
      valueClassName: "text-sky-400",
      accent: true,
    },
    {
      key: "volume",
      label: "Volume traded",
      value: usdt(metrics?.totalVolumeUsdt),
    },
    {
      key: "profit",
      label: "Lifetime profit",
      value: usdt(metrics?.totalProfitUsdt),
      valueClassName:
        (metrics?.totalProfitUsdt ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
    },
    {
      key: "all_deployments",
      label: "Deployments",
      value: v(metrics?.totalDeployments),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map((item) => (
        <SegmentButton
          key={item.key}
          active={segmentFilter === item.key}
          onClick={() => onToggle(item.key)}
          className={cn(
            "w-full p-3",
            item.accent ? "bg-sky-500/[0.06] border-sky-500/15" : "bg-white/[0.02]",
          )}
        >
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 block">
            {item.label}
          </span>
          <span
            className={cn(
              "text-base font-black font-mono block mt-1",
              item.valueClassName ?? "text-white",
            )}
          >
            {loading ? "…" : item.value}
          </span>
        </SegmentButton>
      ))}
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
      {/* Row 1 — narrow lifecycle · activity · PnL (70% combined width) */}
      <div className={TOP_ROW}>
        <Panel title="Lifecycle — mutually exclusive">
          <MiniDonut
            slices={lifecycleSlices}
            centerLabel="Sign ups"
            centerValue={v(metrics?.totalUsers)}
            loading={loading}
            activeKey={segmentFilter}
            onSliceClick={toggle}
            layout="vertical"
            size="lg"
          />
        </Panel>

        <Panel title="Activity — can overlap">
          <ActivityBars
            loading={loading}
            activeKey={segmentFilter}
            onItemClick={toggle}
            tall
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
            layout="vertical"
            size="lg"
          />
        </Panel>
      </div>

      {/* Row 2 — exchange left · platform totals right */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Exchange — deployments &amp; capital">
          <ExchangePanelContent
            exchanges={metrics?.exchanges ?? []}
            totalCapital={totalCapital}
            loading={loading}
            segmentFilter={segmentFilter}
            onToggle={toggle}
            v={v}
            usdt={usdt}
            exchangeFilterKey={exchangeFilterKey}
            exchangeCapitalKey={exchangeCapitalKey}
          />
        </Panel>

        <Panel title="Platform totals">
          <PlatformTotalsContent
            metrics={metrics}
            loading={loading}
            segmentFilter={segmentFilter}
            onToggle={toggle}
            v={v}
            usdt={usdt}
          />
        </Panel>
      </div>
    </div>
  );
}
