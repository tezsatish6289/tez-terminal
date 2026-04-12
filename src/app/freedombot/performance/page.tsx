"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Rocket,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Zap,
  Lock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotStats {
  runningDays: number;
  currentCapital: number;
  startingCapital: number;
  totalReturnPct: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
  winRate: number | null;
  totalTrades: number;
}

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  leverage: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHit: boolean;
  status: "OPEN" | "CLOSED";
  realizedPnl: number;
  positionSize: number | null;
  capitalAtEntry: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null, suffix = "%", decimals = 2) {
  if (n === null || n === undefined) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}${suffix}`;
}

function fmtCapital(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function computeMetrics(trades: Trade[], startingCapital: number) {
  const closed = trades
    .filter((t) => t.status === "CLOSED" && t.closedAt)
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());

  if (closed.length < 3) return null;

  // Equity curve
  let capital = startingCapital;
  let peak = startingCapital;
  let maxDrawdown = 0;
  const curve: { date: string; value: number }[] = [
    { date: "Start", value: startingCapital }
  ];

  const dayPnl = new Map<string, number>();
  const dayCapStart = new Map<string, number>();
  let running = startingCapital;

  for (const t of closed) {
    const day = t.closedAt!.slice(0, 10);
    if (!dayCapStart.has(day)) dayCapStart.set(day, running);
    dayPnl.set(day, (dayPnl.get(day) ?? 0) + (t.realizedPnl ?? 0));
    running += t.realizedPnl ?? 0;
  }

  const sortedDays = Array.from(dayPnl.keys()).sort();
  for (const day of sortedDays) {
    capital += dayPnl.get(day) ?? 0;
    if (capital > peak) peak = capital;
    const dd = peak > 0 ? (peak - capital) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    curve.push({
      date: new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(capital * 100) / 100,
    });
  }

  // Daily returns for Sharpe / Sortino
  const dailyReturns: number[] = [];
  for (const day of sortedDays) {
    const startCap = dayCapStart.get(day) ?? startingCapital;
    if (startCap > 0) dailyReturns.push((dayPnl.get(day) ?? 0) / startCap);
  }

  const n = dailyReturns.length;
  if (n < 2) return { curve, maxDrawdownPct: maxDrawdown * 100, sharpe: null, sortino: null, calmar: null };

  const mean = dailyReturns.reduce((a, r) => a + r, 0) / n;
  const variance = dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const SQRT252 = Math.sqrt(252);

  const sharpe = std > 0 ? (mean / std) * SQRT252 : 0;

  const downside = dailyReturns.filter((r) => r < 0);
  const downsideVar = downside.length > 0
    ? downside.reduce((a, r) => a + r ** 2, 0) / downside.length
    : 0;
  const downsideStd = Math.sqrt(downsideVar);
  const sortino = downsideStd > 0 ? (mean / downsideStd) * SQRT252 : sharpe;

  // Calmar — annualised return / max drawdown
  const totalReturn = (capital - startingCapital) / startingCapital;
  const calendarDays = Math.max(1, (new Date(sortedDays[sortedDays.length - 1]).getTime() - new Date(sortedDays[0]).getTime()) / 86_400_000);
  const annReturn = Math.pow(1 + totalReturn, 365 / calendarDays) - 1;
  const calmar = maxDrawdown > 0 ? annReturn / maxDrawdown : null;

  // close reason breakdown
  const tp1Count = closed.filter((t) => t.tp1Hit).length;
  const tp2Count = closed.filter((t) => t.tp2Hit).length;
  const tp3Count = closed.filter((t) => t.tp3Hit).length;
  const slCount  = closed.filter((t) => t.slHit).length;

  return {
    curve,
    maxDrawdownPct: maxDrawdown * 100,
    sharpe,
    sortino,
    calmar,
    tp1Count,
    tp2Count,
    tp3Count,
    slCount,
    closedCount: closed.length,
  };
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  return (
    <div className="rounded-xl px-3 py-2 text-xs font-bold" style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.2)" }}>
      <p style={{ color: "#475569" }}>{label}</p>
      <p style={{ color: val >= 1000 ? "#34d399" : "#f87171" }}>{fmtCapital(val)}</p>
    </div>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function RatioCard({ label, value, desc, color }: { label: string; value: string; desc: string; color: string }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col" style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#334155" }}>{label}</p>
      <p className="text-3xl font-black mb-2" style={{ color }}>{value}</p>
      <p className="text-xs leading-relaxed mt-auto" style={{ color: "#475569" }}>{desc}</p>
    </div>
  );
}

function MethodCard({ icon: Icon, title, children, accent = "#3b82f6" }: {
  icon: React.ElementType; title: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}25` }}>
          <Icon className="h-4.5 w-4.5" style={{ color: accent }} />
        </div>
        <h3 className="text-sm font-black text-white">{title}</h3>
      </div>
      <div className="space-y-2.5 text-sm leading-relaxed" style={{ color: "#64748b" }}>
        {children}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
      <span>{children}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/freedombot/stats").then((r) => r.json()),
      fetch("/api/freedombot/trades").then((r) => r.json()),
    ]).then(([s, t]) => {
      if (s && !s.error) setStats(s);
      if (t?.trades) setTrades(t.trades);
    }).finally(() => setLoading(false));
  }, []);

  const metrics = useMemo(
    () => (trades.length > 0 && stats?.startingCapital ? computeMetrics(trades, stats.startingCapital) : null),
    [trades, stats]
  );

  const startCapital = stats?.startingCapital ?? 1000;

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>

      {/* ── Nav ── */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: "rgba(8,15,30,0.92)", borderColor: "rgba(90,140,220,0.12)", backdropFilter: "blur(16px)" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="rounded-xl object-contain" />
            <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>FreedomBot.ai</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-xs font-bold transition-colors hover:text-white flex-shrink-0" style={{ color: "#64748b" }}>
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to Home</span>
            <span className="sm:hidden">Home</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-16">

        {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
        <div className="text-center max-w-2xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
            style={{ backgroundColor: "rgba(37,99,235,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#93c5fd" }}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Live Performance
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
            Transparent by{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}>
              design
            </span>
          </h1>
          <p className="text-base sm:text-lg leading-relaxed" style={{ color: "#64748b" }}>
            Real capital. Real trades. Every number on this page is live — pulled directly from our trading system, not a backtest.
          </p>
        </div>

        {/* ══ LIVE METRICS ════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "#334155" }}>Live Performance</h2>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ backgroundColor: "#0a1628", height: 80 }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Running",        value: stats ? `${stats.runningDays} Days` : "—",   color: "#f0f4ff" },
                { label: "Start Capital",  value: fmtCapital(stats?.startingCapital),            color: "#f0f4ff" },
                { label: "Current Capital",value: fmtCapital(stats?.currentCapital),             color: "#60a5fa" },
                { label: "Total Return",   value: fmt(stats?.totalReturnPct ?? null),             color: (stats?.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171" },
                { label: "Monthly Return", value: fmt(stats?.profitPerMonth ?? null), sub: "Proj.", color: "#60a5fa" },
                { label: "Annual Return",  value: fmt(stats?.profitPerYear ?? null),  sub: "Proj.", color: "#a78bfa" },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl p-4 text-center" style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#334155" }}>{s.label}</p>
                  <p className="text-base sm:text-lg font-black" style={{ color: s.color }}>{s.value}</p>
                  {"sub" in s && s.sub && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 inline-block" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                      {s.sub}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {[
              { label: "Total Trades",   value: stats?.totalTrades?.toString() ?? "—",                    color: "#f0f4ff" },
              { label: "Win Rate",       value: stats?.winRate != null ? `${stats.winRate}%` : "—",        color: "#34d399" },
              { label: "Max Drawdown",   value: metrics ? fmt(-metrics.maxDrawdownPct) : "—",              color: "#f87171" },
              { label: "SL Triggered",  value: metrics && metrics.closedCount > 0 ? `${Math.round((metrics.slCount / metrics.closedCount) * 100)}%` : "—", color: "#fbbf24" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl p-4 text-center" style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#334155" }}>{s.label}</p>
                <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══ EQUITY CURVE ════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#334155" }}>Fund Value Over Time</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#334155" }}>
              Starting {fmtCapital(startCapital)}
            </span>
          </div>
          <div className="rounded-2xl p-4 sm:p-6" style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}>
            {loading || !metrics?.curve?.length ? (
              <div className="h-56 flex items-center justify-center" style={{ color: "#334155" }}>
                {loading ? "Loading chart…" : "Not enough data yet"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={metrics.curve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#334155", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#334155", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                    domain={["auto", "auto"]}
                    width={55}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={startCapital} stroke="rgba(90,140,220,0.15)" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#34d399", strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-[11px] mt-3" style={{ color: "#1e3a5f" }}>
            Based on closed trades only. Each data point represents end-of-day fund value. Live and open positions are not included.
          </p>
        </section>

        {/* ══ RISK-ADJUSTED RATIOS ════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>Risk-Adjusted Performance</h2>
          <p className="text-sm mb-5" style={{ color: "#475569" }}>
            Raw returns are easy to fake with leverage. Risk-adjusted ratios tell you how efficiently capital is being deployed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <RatioCard
              label="Sharpe Ratio"
              value={metrics?.sharpe != null ? `+${metrics.sharpe.toFixed(2)}` : "—"}
              color="#60a5fa"
              desc="Return per unit of total risk. Above 1 is good; above 2 is excellent. We target > 2."
            />
            <RatioCard
              label="Sortino Ratio"
              value={metrics?.sortino != null ? `+${metrics.sortino.toFixed(2)}` : "—"}
              color="#a78bfa"
              desc="Like Sharpe but penalises only downside volatility — the risk that actually matters."
            />
            <RatioCard
              label="Calmar Ratio"
              value={metrics?.calmar != null ? `+${metrics.calmar.toFixed(2)}` : "—"}
              color="#34d399"
              desc="Annualised return divided by max drawdown. Higher means better recovery from the worst dip."
            />
            <RatioCard
              label="Max Drawdown"
              value={metrics?.maxDrawdownPct != null ? fmt(-metrics.maxDrawdownPct) : "—"}
              color="#f87171"
              desc="The largest peak-to-trough decline in fund value. Lower is better — this is your worst-case scenario."
            />
          </div>
        </section>

        {/* ══ HOW WE EXECUTE ══════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>How We Execute Trades</h2>
          <p className="text-sm mb-6" style={{ color: "#475569" }}>
            Every trade follows a strict, rule-based playbook. No improvisation. No emotions.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">

            <MethodCard icon={Target} title="Stop Loss — Capital Protection First" accent="#f87171">
              <Bullet>Every position has a Stop Loss set <strong className="text-white">at the moment of entry</strong> — no exceptions.</Bullet>
              <Bullet>SL is placed at a technically significant level, not an arbitrary percentage, so it reflects genuine market structure.</Bullet>
              <Bullet>If SL is triggered, the position is fully closed and capital is preserved for the next opportunity.</Bullet>
            </MethodCard>

            <MethodCard icon={TrendingUp} title="Trailing Stop Loss — Lock In Gains" accent="#34d399">
              <Bullet>Once a trade moves in our favour past a defined threshold, the SL automatically trails the price.</Bullet>
              <Bullet>This locks in profit progressively — you can never give back more than a small portion of an open gain.</Bullet>
              <Bullet>Trailing is based on market structure, not a fixed trailing distance, so it adapts to volatility.</Bullet>
            </MethodCard>

            <MethodCard icon={Zap} title="Partial Profit Booking (TP1 & TP2)" accent="#fbbf24">
              <Bullet><strong className="text-white">TP1</strong> closes roughly <strong className="text-white">40% of the position</strong> at the first target — locking in guaranteed profit early.</Bullet>
              <Bullet><strong className="text-white">TP2</strong> closes another <strong className="text-white">40%</strong> at a deeper target as momentum continues.</Bullet>
              <Bullet>After TP1 hits, the SL is moved to breakeven — making the remaining position <strong className="text-white">risk-free</strong>.</Bullet>
              {metrics && metrics.tp1Count > 0 && (
                <Bullet>
                  In our live run, TP1 was hit in <strong className="text-white">{metrics.tp1Count} trades</strong>
                  {metrics.tp2Count > 0 && `, TP2 in ${metrics.tp2Count}`}.
                </Bullet>
              )}
            </MethodCard>

            <MethodCard icon={CheckCircle2} title="Full Profit Booking (TP3)" accent="#60a5fa">
              <Bullet><strong className="text-white">TP3</strong> exits the final <strong className="text-white">20%</strong> of the position at the maximum target.</Bullet>
              <Bullet>This is the &quot;let the winners run&quot; portion — giving the trade room to capture the full move.</Bullet>
              <Bullet>If TP3 is not reached, the trailing SL eventually closes this slice at a still-profitable level.</Bullet>
              {metrics && metrics.tp3Count > 0 && (
                <Bullet>TP3 (full target) hit in <strong className="text-white">{metrics.tp3Count} trades</strong> in our live run.</Bullet>
              )}
            </MethodCard>
          </div>
        </section>

        {/* ══ RISK MANAGEMENT ═════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>Risk Management</h2>
          <p className="text-sm mb-6" style={{ color: "#475569" }}>
            Protecting your capital is the first job. Growth is second.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">

            <MethodCard icon={ShieldCheck} title="Position Sizing — Never Risk the House" accent="#34d399">
              <Bullet>Each trade risks a <strong className="text-white">fixed percentage of current capital</strong>, not a fixed dollar amount.</Bullet>
              <Bullet>As your capital grows, position sizes grow proportionally — compounding gains automatically.</Bullet>
              <Bullet>As capital contracts, sizes shrink — protecting against a bad streak wiping out the account.</Bullet>
            </MethodCard>

            <MethodCard icon={Lock} title="Leverage — Controlled, Not Reckless" accent="#a78bfa">
              <Bullet>We use leverage to amplify <strong className="text-white">signal efficiency</strong>, not to chase bigger bets.</Bullet>
              <Bullet>Leverage is capped. With our position sizing, a stop-loss hit represents a <strong className="text-white">small, defined loss</strong> — not a wipeout.</Bullet>
              <Bullet>The distance from entry to stop loss is always wider than the liquidation price — <strong className="text-white">liquidation cannot happen on a normal SL-triggering move</strong>.</Bullet>
            </MethodCard>

            <MethodCard icon={AlertTriangle} title="Funding Rate Awareness" accent="#fbbf24">
              <Bullet>In perpetual futures, open positions pay or receive <strong className="text-white">funding every 8 hours</strong>.</Bullet>
              <Bullet>We monitor funding rates in real time. When funding becomes extreme (very positive or very negative), it signals an overcrowded trade — a potential reversal.</Bullet>
              <Bullet>High funding on a long = we avoid adding. Extremely negative funding = we look for long entries, not shorts.</Bullet>
            </MethodCard>

            <MethodCard icon={TrendingDown} title="Liquidation Protection" accent="#f87171">
              <Bullet>Liquidation happens when losses consume your margin. Our position sizing ensures the SL is always triggered <strong className="text-white">long before</strong> the liquidation price is reached.</Bullet>
              <Bullet>We do not use cross-margin (where all capital is at risk). Each trade&apos;s risk is isolated.</Bullet>
              <Bullet>In the event of a flash crash (price gap past the SL), the position is closed at the next available price — but liquidation risk is structurally eliminated by design.</Bullet>
            </MethodCard>
          </div>
        </section>

        {/* ══ MARKET INTELLIGENCE ═════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#334155" }}>Market Intelligence</h2>
          <p className="text-sm mb-6" style={{ color: "#475569" }}>
            We don&apos;t just react to price. We read the market&apos;s structure and intent.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">

            <MethodCard icon={BarChart3} title="Order Blocks" accent="#60a5fa">
              <Bullet>Order blocks are price zones where large institutional orders were previously filled — leaving a footprint in price action.</Bullet>
              <Bullet>Price often returns to these zones to &quot;retest&quot; them. We use order blocks to identify <strong className="text-white">high-probability entry zones</strong> and <strong className="text-white">stop-loss placement levels</strong>.</Bullet>
              <Bullet>Entering at an order block means a tighter SL to a nearby invalidation point — better risk-reward on every trade.</Bullet>
            </MethodCard>

            <MethodCard icon={Zap} title="Liquidation Heatmaps" accent="#fbbf24">
              <Bullet>Exchanges track where leveraged positions will be force-closed. This creates <strong className="text-white">liquidity clusters</strong> at predictable price levels.</Bullet>
              <Bullet>Large players often push price into these zones to trigger liquidations and fill their own orders at better prices.</Bullet>
              <Bullet>We map these zones in advance, avoiding placing stops at obvious liquidation clusters and using heatmap data as a confluence signal.</Bullet>
            </MethodCard>

            <MethodCard icon={TrendingUp} title="Funding Rate Signals" accent="#34d399">
              <Bullet>Funding rate is a real-time measure of market sentiment. When everyone is long and paying high funding, the crowd is likely wrong.</Bullet>
              <Bullet>We use extreme funding readings as a <strong className="text-white">contrarian filter</strong> — avoiding trades that align with an overly crowded side.</Bullet>
              <Bullet>Normal or negative funding supports long bias. Extreme positive funding signals caution on longs and potential short opportunity.</Bullet>
            </MethodCard>
          </div>
        </section>

        {/* ══ WHAT WE DON'T SHARE ════════════════════════════════════════════ */}
        <section>
          <div
            className="rounded-2xl p-6 sm:p-8"
            style={{ backgroundColor: "rgba(37,99,235,0.04)", border: "1px solid rgba(96,165,250,0.12)" }}
          >
            <h2 className="text-base font-black text-white mb-3">What we don&apos;t publish</h2>
            <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
              The specific signal logic — which indicators, which thresholds, which combinations trigger an entry — is our core IP.
              Publishing it would let anyone replicate (and front-run) the strategy, degrading performance for all users.
              What you see above is <strong className="text-white/70">everything that matters to you as a capital allocator</strong>:
              how risk is managed, what the real numbers look like, and exactly what the system does when things go right or wrong.
            </p>
          </div>
        </section>

        {/* ══ CTA ═════════════════════════════════════════════════════════════ */}
        <section className="text-center pb-8">
          <p className="text-sm mb-6" style={{ color: "#475569" }}>Ready to let FreedomBot trade for you?</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 h-14 px-10 rounded-2xl font-bold text-base text-white transition-all hover:scale-105"
            style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", boxShadow: "0 8px 30px rgba(59,130,246,0.35)" }}
          >
            <Rocket className="h-5 w-5" />
            Deploy Your Bot
          </Link>
          <p className="text-xs mt-4" style={{ color: "#334155" }}>
            Takes less than 5 minutes · No withdrawal access required · Free to start
          </p>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="py-8 border-t" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={24} height={24} className="rounded-lg object-contain" />
            <span className="text-xs font-bold" style={{ color: "#334155" }}>freedombot.ai</span>
          </Link>
          <p className="text-[11px]" style={{ color: "#1e3a5f" }}>
            &copy; {new Date().getFullYear()} FreedomBot.ai · Trading involves risk. Past performance does not guarantee future results.
          </p>
        </div>
      </footer>

    </div>
  );
}
