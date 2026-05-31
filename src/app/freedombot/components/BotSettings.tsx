"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Activity,
  RefreshCw,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import {
  DEFAULT_TRADING_PREFS,
  type TradingPrefs,
} from "@/lib/freedombot/trading-prefs-shared";
import { RiskControls } from "./risk-controls";
import {
  RetentionInterventionModal,
  shouldShowRetentionIntervention,
  type RetentionIntent,
} from "./RetentionInterventionModal";
import type { User } from "firebase/auth";
import {
  getCryptoExchangeDef,
  getCryptoHelpGuide,
} from "./exchange-fields";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeploymentWallet {
  total: number | null;
  available: number | null;
  currency: string | null;
  status: "valid" | "invalid";
  error: string | null;
  checkedAt: string | null;
}

export interface SettingsDeployment {
  id: string;
  /** Deploy key — CRYPTO / BTC / ETH / SOL / XRP. Drives per-bot
   *  filtering of the cap dropdown in `RiskControls`. */
  bot: string;
  exchange: string;
  status: "active" | "paused";
  keyLastFour: string | null;
  wallet: DeploymentWallet | null;
  tradingPrefs?: TradingPrefs;
  createdAt?: string | null;
}

interface BotSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  deployment: SettingsDeployment;
  /** Product bot name — e.g. Crypto Bot, Bitcoin Bot. */
  botLabel: string;
  exchangeLabel: string;
  /** Number of OPEN trades for this deployment (drives the delete-warning copy). */
  openTradesCount: number;
  /** Cached lifetime realised P&L for retention copy (optional). */
  lifetimeRealizedPnl?: number | null;
  /** Called whenever a backend action mutates state — parent should re-fetch
   *  deployments and trades so the dashboard chrome updates. */
  onMutated: () => void;
}

// ─── Time helpers ────────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtCurrency(n: number | null, currency: string | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const cur = currency ?? "USDT";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BotSettings({
  isOpen,
  onClose,
  user,
  deployment,
  botLabel,
  exchangeLabel,
  openTradesCount,
  lifetimeRealizedPnl = null,
  onMutated,
}: BotSettingsProps) {
  // Local wallet snapshot so the panel can update in place after Test /
  // Update API key without waiting for the parent to re-fetch deployments.
  const [wallet, setWallet] = useState<DeploymentWallet | null>(deployment.wallet);
  const [keyLastFour, setKeyLastFour] = useState<string | null>(deployment.keyLastFour);
  const [testBusy, setTestBusy] = useState(false);

  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateBanner, setUpdateBanner] = useState<{
    tone: "success" | "info";
    text: string;
  } | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionIntent, setRetentionIntent] = useState<RetentionIntent>("pause");
  const [tradingPrefs, setTradingPrefs] = useState<TradingPrefs>(
    deployment.tradingPrefs ?? DEFAULT_TRADING_PREFS,
  );
  const [savedTradingPrefs, setSavedTradingPrefs] = useState<TradingPrefs>(
    deployment.tradingPrefs ?? DEFAULT_TRADING_PREFS,
  );
  const [riskSaveBusy, setRiskSaveBusy] = useState(false);
  const [riskSaveError, setRiskSaveError] = useState<string | null>(null);
  const [riskSaveOk, setRiskSaveOk] = useState(false);

  // Reset local state whenever the panel switches to a different deployment
  // — without this, opening Settings on Bybit after closing Hyperliquid
  // would briefly show Hyperliquid's wallet on the new panel.
  useEffect(() => {
    setWallet(deployment.wallet);
    setKeyLastFour(deployment.keyLastFour);
    setUpdateOpen(false);
    setDeleteOpen(false);
    setRetentionOpen(false);
    setUpdateBanner(null);
    const prefs = deployment.tradingPrefs ?? DEFAULT_TRADING_PREFS;
    setTradingPrefs(prefs);
    setSavedTradingPrefs(prefs);
    setRiskSaveError(null);
    setRiskSaveOk(false);
  }, [deployment.id, deployment.wallet, deployment.keyLastFour, deployment.tradingPrefs]);

  const exchangeDef = useMemo(
    () => getCryptoExchangeDef(deployment.exchange),
    [deployment.exchange],
  );

  const handleTest = useCallback(
    async (force: boolean) => {
      if (!user) return;
      setTestBusy(true);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/freedombot/test-connection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ deploymentId: deployment.id, force }),
        });
        const data = await res.json();
        if (typeof data.status === "string") {
          setWallet({
            total: typeof data.total === "number" ? data.total : null,
            available: typeof data.available === "number" ? data.available : null,
            currency: typeof data.currency === "string" ? data.currency : null,
            status: data.status === "valid" ? "valid" : "invalid",
            error: typeof data.error === "string" ? data.error : null,
            checkedAt: typeof data.checkedAt === "string" ? data.checkedAt : null,
          });
        }
      } catch {
        // Leave the previous wallet snapshot intact — failing silently here
        // is better than blanking out a known-good balance just because the
        // user briefly went offline.
      } finally {
        setTestBusy(false);
      }
    },
    [user, deployment.id],
  );

  const handlePause = useCallback(async () => {
    if (!user) return;
    setPauseBusy(true);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/freedombot/pause-deployment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ deploymentId: deployment.id }),
      });
      onMutated();
    } finally {
      setPauseBusy(false);
    }
  }, [user, deployment.id, onMutated]);

  const handleResume = useCallback(async () => {
    if (!user) return;
    setResumeBusy(true);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/freedombot/resume-deployment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ deploymentId: deployment.id }),
      });
      onMutated();
    } finally {
      setResumeBusy(false);
    }
  }, [user, deployment.id, onMutated]);

  const riskDirty =
    tradingPrefs.riskPerTrade !== savedTradingPrefs.riskPerTrade ||
    tradingPrefs.maxConcurrentTrades !== savedTradingPrefs.maxConcurrentTrades ||
    tradingPrefs.dailyLossLimit !== savedTradingPrefs.dailyLossLimit;

  const handleSaveRisk = useCallback(async () => {
    if (!user || !riskDirty) return;
    setRiskSaveBusy(true);
    setRiskSaveError(null);
    setRiskSaveOk(false);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/trading-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          deploymentId: deployment.id,
          ...tradingPrefs,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRiskSaveError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const next =
        data.tradingPrefs && typeof data.tradingPrefs === "object"
          ? (data.tradingPrefs as TradingPrefs)
          : tradingPrefs;
      setTradingPrefs(next);
      setSavedTradingPrefs(next);
      setRiskSaveOk(true);
      onMutated();
    } catch (e) {
      setRiskSaveError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setRiskSaveBusy(false);
    }
  }, [user, deployment.id, tradingPrefs, riskDirty, onMutated]);

  const runningDays = deployment.createdAt
    ? Math.floor(
        (Date.now() - new Date(deployment.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      )
    : 0;

  const requestPause = useCallback(() => {
    if (shouldShowRetentionIntervention("pause", lifetimeRealizedPnl ?? null)) {
      setRetentionIntent("pause");
      setRetentionOpen(true);
      return;
    }
    void handlePause();
  }, [lifetimeRealizedPnl, handlePause]);

  const requestDelete = useCallback(() => {
    if (shouldShowRetentionIntervention("delete", lifetimeRealizedPnl ?? null)) {
      setRetentionIntent("delete");
      setRetentionOpen(true);
      return;
    }
    setDeleteOpen(true);
  }, [lifetimeRealizedPnl]);

  const onRetentionContinue = useCallback(() => {
    setRetentionOpen(false);
    if (retentionIntent === "pause") {
      void handlePause();
    } else {
      setDeleteOpen(true);
    }
  }, [retentionIntent, handlePause]);

  if (!isOpen) return null;

  const isPaused = deployment.status === "paused";
  const lockedAmount =
    wallet && wallet.total != null && wallet.available != null
      ? Math.max(0, wallet.total - wallet.available)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div className="flex-1" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[440px] h-full overflow-y-auto"
        style={{
          backgroundColor: "#0a1628",
          borderLeft: "1px solid rgba(90,140,220,0.18)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4"
          style={{
            backgroundColor: "#0a1628",
            borderBottom: "1px solid rgba(90,140,220,0.12)",
          }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
              Bot Settings
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <h2 className="text-base font-black text-white truncate">{botLabel}</h2>
              <BotStatusPill isPaused={isPaused} />
            </div>
            <p className="text-xs font-medium mt-0.5 truncate" style={{ color: "#64748b" }}>
              {exchangeLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/[0.06]"
            style={{ color: "#64748b" }}
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-5 space-y-6">
          {/* ── Connection block ─────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={Activity} text="Connection" />
            <ConnectionCard
              wallet={wallet}
              keyLastFour={keyLastFour}
              lockedAmount={lockedAmount}
              testBusy={testBusy}
              onTest={() => handleTest(true)}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleTest(true)}
                disabled={testBusy}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  backgroundColor: "rgba(90,140,220,0.08)",
                  color: "#a3b8d8",
                  border: "1px solid rgba(90,140,220,0.18)",
                }}
              >
                {testBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Test connection
              </button>
              <button
                onClick={() => setUpdateOpen((v) => !v)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: "rgba(59,130,246,0.08)",
                  color: "#60a5fa",
                  border: "1px solid rgba(59,130,246,0.18)",
                }}
              >
                <KeyRound className="h-3.5 w-3.5" />
                {updateOpen ? "Cancel update" : "Update API key"}
              </button>
            </div>

            {updateBanner && (
              <div
                className="mt-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed"
                style={{
                  backgroundColor:
                    updateBanner.tone === "info"
                      ? "rgba(59,130,246,0.07)"
                      : "rgba(34,197,94,0.07)",
                  color: updateBanner.tone === "info" ? "#93c5fd" : "#86efac",
                  border:
                    updateBanner.tone === "info"
                      ? "1px solid rgba(59,130,246,0.15)"
                      : "1px solid rgba(34,197,94,0.15)",
                }}
              >
                {updateBanner.text}
              </div>
            )}

            {updateOpen && exchangeDef && (
              <div className="mt-4">
                <UpdateApiKeyForm
                  user={user}
                  deploymentId={deployment.id}
                  exchange={deployment.exchange}
                  exchangeLabel={exchangeLabel}
                  fields={exchangeDef.fields}
                  onSuccess={(newWallet, newLastFour, unchanged) => {
                    if (newWallet) setWallet(newWallet);
                    if (newLastFour) setKeyLastFour(newLastFour);
                    setUpdateOpen(false);
                    setUpdateBanner(
                      unchanged
                        ? {
                            tone: "info",
                            text:
                              "These keys are already on file — connection is valid. Nothing was changed.",
                          }
                        : {
                            tone: "success",
                            text:
                              "API keys updated. Old keys are no longer on file.",
                          },
                    );
                    // Refresh parent state (deployments list + trades) so
                    // the new keyLastFour / wallet snapshot also lands on
                    // the dashboard chrome outside this panel.
                    if (!unchanged) onMutated();
                  }}
                />
              </div>
            )}
          </section>

          {/* ── Risk & sizing ───────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={Shield} text="Risk & sizing" />
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                backgroundColor: "rgba(10,22,40,0.6)",
                border: "1px solid rgba(90,140,220,0.12)",
              }}
            >
              <div className="space-y-2 text-xs leading-relaxed" style={{ color: "#64748b" }}>
                <p>
                  These settings control how the bot trades on{" "}
                  <span className="text-slate-300">{exchangeLabel}</span>.
                </p>
                <p>
                  <span className="font-semibold text-slate-400">Risk per trade</span> — how much of
                  your balance is put at risk on each new position.{" "}
                  <span className="font-semibold text-slate-400">Max open</span> — how many positions
                  can run at once.{" "}
                  <span className="font-semibold text-slate-400">Daily loss cap</span> — if
                  today&apos;s losses reach this %, the bot pauses new trades and may close open
                  positions; resume when you&apos;re ready.
                </p>
                <p>
                  Each trade is sized from funds you have free to use (not already locked in other
                  trades), and stays within your exchange&apos;s limits.
                </p>
              </div>
              <RiskControls
                values={tradingPrefs}
                onChange={(next) => {
                  setTradingPrefs(next);
                  setRiskSaveOk(false);
                }}
                disabled={riskSaveBusy}
                bot={deployment.bot}
              />
              {riskSaveError && (
                <div
                  className="rounded-xl px-3 py-2 text-[11px] leading-relaxed"
                  style={{
                    backgroundColor: "rgba(239,68,68,0.07)",
                    color: "#fca5a5",
                    border: "1px solid rgba(239,68,68,0.15)",
                  }}
                >
                  {riskSaveError}
                </div>
              )}
              {riskSaveOk && !riskDirty && (
                <p className="text-[11px] font-bold" style={{ color: "#34d399" }}>
                  Risk settings saved.
                </p>
              )}
              <button
                type="button"
                onClick={handleSaveRisk}
                disabled={!riskDirty || riskSaveBusy}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
                style={{
                  backgroundColor: "rgba(59,130,246,0.12)",
                  color: "#60a5fa",
                  border: "1px solid rgba(59,130,246,0.25)",
                }}
              >
                {riskSaveBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Save risk settings
              </button>
            </div>
          </section>

          {/* ── Status block ─────────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={isPaused ? PauseCircle : PlayCircle} text="Status" />
            <div
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "rgba(10,22,40,0.6)",
                border: "1px solid rgba(90,140,220,0.12)",
              }}
            >
              <p className="text-xs leading-relaxed mb-4" style={{ color: "#64748b" }}>
                {isPaused
                  ? "New trade entries are blocked. Open trades will keep running until they hit TP / SL. Resume any time — your keys stay on file."
                  : "Pausing blocks new trade entries. Open trades continue until they hit TP / SL. You can resume any time."}
              </p>
              {isPaused ? (
                <button
                  onClick={handleResume}
                  disabled={resumeBusy}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{
                    backgroundColor: "rgba(34,197,94,0.1)",
                    color: "#22c55e",
                    border: "1px solid rgba(34,197,94,0.25)",
                  }}
                >
                  {resumeBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="h-3.5 w-3.5" />
                  )}
                  Resume bot
                </button>
              ) : (
                <button
                  onClick={requestPause}
                  disabled={pauseBusy}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{
                    backgroundColor: "rgba(251,191,36,0.1)",
                    color: "#fbbf24",
                    border: "1px solid rgba(251,191,36,0.25)",
                  }}
                >
                  {pauseBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PauseCircle className="h-3.5 w-3.5" />
                  )}
                  Pause bot
                </button>
              )}
            </div>
          </section>

          {/* ── Danger Zone ──────────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={AlertCircle} text="Danger zone" tone="danger" />
            <div
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "rgba(239,68,68,0.04)",
                border: "1px solid rgba(239,68,68,0.18)",
              }}
            >
              <p className="text-xs leading-relaxed mb-4" style={{ color: "#94a3b8" }}>
                {openTradesCount > 0 ? (
                  <>
                    You have{" "}
                    <span className="font-bold text-white">
                      {openTradesCount} open trade{openTradesCount === 1 ? "" : "s"}
                    </span>
                    . Deleting will market-close{" "}
                    {openTradesCount === 1 ? "it" : "them"} on {exchangeLabel}, cancel
                    residual exit orders, and remove your API keys from our database.
                  </>
                ) : (
                  <>
                    Deleting removes your API keys from our database. You will need to
                    deploy again to use the bot on {exchangeLabel}.
                  </>
                )}{" "}
                <span className="font-semibold text-rose-300">This cannot be undone.</span>
              </p>
              <button
                onClick={requestDelete}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: "rgba(239,68,68,0.08)",
                  color: "#f87171",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete bot
              </button>
            </div>
          </section>
        </div>

        <RetentionInterventionModal
          isOpen={retentionOpen}
          intent={retentionIntent}
          user={user}
          exchange={deployment.exchange}
          exchangeLabel={exchangeLabel}
          runningDays={runningDays}
          lifetimeRealizedPnl={lifetimeRealizedPnl ?? null}
          onKeepRunning={() => setRetentionOpen(false)}
          onContinueAnyway={onRetentionContinue}
        />

        {deleteOpen && (
          <DeleteConfirm
            user={user}
            deploymentId={deployment.id}
            exchangeLabel={exchangeLabel}
            openTradesCount={openTradesCount}
            onCancel={() => setDeleteOpen(false)}
            onDeleted={() => {
              setDeleteOpen(false);
              onClose();
              onMutated();
            }}
          />
        )}
      </aside>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BotStatusPill({ isPaused }: { isPaused: boolean }) {
  const color = isPaused ? "#fbbf24" : "#22c55e";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
      style={{
        color,
        backgroundColor: isPaused ? "rgba(251,191,36,0.12)" : "rgba(34,197,94,0.12)",
        border: `1px solid ${isPaused ? "rgba(251,191,36,0.25)" : "rgba(34,197,94,0.25)"}`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {isPaused ? "Paused" : "Running"}
    </span>
  );
}

function SectionLabel({
  icon: Icon,
  text,
  tone,
}: {
  icon: typeof Activity;
  text: string;
  tone?: "danger";
}) {
  const color = tone === "danger" ? "#f87171" : "#94a3b8";
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <p
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color }}
      >
        {text}
      </p>
    </div>
  );
}

function ConnectionCard({
  wallet,
  keyLastFour,
  lockedAmount,
  testBusy,
  onTest,
}: {
  wallet: DeploymentWallet | null;
  keyLastFour: string | null;
  lockedAmount: number | null;
  testBusy: boolean;
  onTest: () => void;
}) {
  // Indicator color matches the wallet status: green when last fetch
  // succeeded, red when it failed, grey when we never had one.
  const status = wallet?.status ?? null;
  const dotColor =
    status === "valid" ? "#22c55e" : status === "invalid" ? "#f87171" : "#475569";
  const statusLabel =
    status === "valid"
      ? "Connected"
      : status === "invalid"
        ? "Connection failed"
        : "Not tested yet";

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        backgroundColor: "rgba(10,22,40,0.6)",
        border: `1px solid ${status === "invalid" ? "rgba(239,68,68,0.25)" : "rgba(90,140,220,0.12)"}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 5px ${dotColor}` }}
          />
          <span className="text-sm font-bold" style={{ color: dotColor }}>
            {statusLabel}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "#64748b" }}>
          {testBusy ? "Testing…" : `Tested ${relTime(wallet?.checkedAt ?? null)}`}
        </span>
      </div>

      {status === "invalid" && wallet?.error && (
        <div
          className="rounded-xl px-3 py-2 text-[11px] leading-relaxed"
          style={{
            backgroundColor: "rgba(239,68,68,0.07)",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.15)",
          }}
        >
          {wallet.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
            Wallet balance
          </p>
          <p className="text-base font-black mt-1" style={{ color: "#f0f4ff" }}>
            {fmtCurrency(wallet?.total ?? null, wallet?.currency ?? null)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
            Available
          </p>
          <p className="text-base font-black mt-1" style={{ color: "#34d399" }}>
            {fmtCurrency(wallet?.available ?? null, wallet?.currency ?? null)}
          </p>
        </div>
        {lockedAmount != null && lockedAmount > 0 && (
          <div className="col-span-2 pt-1">
            <p className="text-[10px]" style={{ color: "#64748b" }}>
              {fmtCurrency(lockedAmount, wallet?.currency ?? null)} locked in open trades
            </p>
          </div>
        )}
        <div className="col-span-2 pt-1">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
            API key
          </p>
          <p className="text-xs font-mono mt-1" style={{ color: "#94a3b8" }}>
            ••••{keyLastFour ?? "????"}
          </p>
        </div>
      </div>
    </div>
  );
}

interface UpdateApiKeyFormProps {
  user: User | null;
  deploymentId: string;
  exchange: string;
  exchangeLabel: string;
  fields: { key: string; label: string; type: "text" | "password"; placeholder: string; hint?: string }[];
  /** Called on success (whether rotated or no-op). `unchanged: true` means
   *  the user submitted the exact keys already on file — UI uses this to
   *  show a different success copy ("already on file — connection valid")
   *  instead of pretending an update happened. */
  onSuccess: (
    wallet: DeploymentWallet | null,
    keyLastFour: string | null,
    unchanged: boolean,
  ) => void;
}

function UpdateApiKeyForm({
  user,
  deploymentId,
  exchange,
  exchangeLabel,
  fields,
  onSuccess,
}: UpdateApiKeyFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const helpGuide = useMemo(() => getCryptoHelpGuide(exchange), [exchange]);

  const canSubmit =
    fields.every((f) => (values[f.key] ?? "").trim().length > 0) && !busy;

  const submit = async () => {
    if (!user || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/update-credentials", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ deploymentId, credentials: values }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const newWallet: DeploymentWallet | null = data.wallet
        ? {
            total: typeof data.wallet.total === "number" ? data.wallet.total : null,
            available:
              typeof data.wallet.available === "number" ? data.wallet.available : null,
            currency: null, // server doesn't return currency here; UI keeps prior
            status: "valid",
            error: null,
            checkedAt: new Date().toISOString(),
          }
        : null;
      onSuccess(
        newWallet,
        typeof data.keyLastFour === "string" ? data.keyLastFour : null,
        data.unchanged === true,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        backgroundColor: "rgba(59,130,246,0.04)",
        border: "1px solid rgba(59,130,246,0.18)",
      }}
    >
      <p className="text-[11px] leading-relaxed" style={{ color: "#94a3b8" }}>
        Generate a new key on {exchangeLabel} and paste it below. Your old key stays
        active until the new one validates — if validation fails, nothing changes.
      </p>

      {helpGuide && (
        <div>
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-bold transition-colors hover:text-blue-300"
            style={{ color: "#60a5fa" }}
          >
            {helpOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            How to generate a new {exchangeLabel} key
          </button>
          {helpOpen && (
            <div
              className="mt-2 rounded-xl p-3 text-[11px] leading-relaxed space-y-2"
              style={{
                backgroundColor: "rgba(10,22,40,0.6)",
                border: "1px solid rgba(90,140,220,0.12)",
                color: "#94a3b8",
              }}
            >
              <a
                href={helpGuide.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-bold"
                style={{ color: "#60a5fa" }}
              >
                {helpGuide.urlLabel} <ExternalLink className="h-3 w-3" />
              </a>
              <ol className="list-decimal pl-4 space-y-1">
                {helpGuide.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <p className="text-amber-300/80">{helpGuide.warning}</p>
            </div>
          )}
        </div>
      )}

      {fields.map((f) => {
        const isSecret = f.type === "password";
        const reveal = !!showSecret[f.key];
        const inputType = isSecret && !reveal ? "password" : "text";
        return (
          <div key={f.key}>
            <label
              className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
              style={{ color: "#64748b" }}
            >
              {f.label}
            </label>
            <div className="relative">
              <input
                type={inputType}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl px-3 py-2.5 text-xs font-mono outline-none transition-colors focus:border-blue-400/40"
                style={{
                  backgroundColor: "#060d1a",
                  color: "#f0f4ff",
                  border: "1px solid rgba(90,140,220,0.18)",
                }}
              />
              {isSecret && (
                <button
                  type="button"
                  onClick={() =>
                    setShowSecret((s) => ({ ...s, [f.key]: !s[f.key] }))
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-white/[0.06]"
                  style={{ color: "#64748b" }}
                  aria-label={reveal ? "Hide secret" : "Show secret"}
                >
                  {reveal ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
            {f.hint && (
              <p className="text-[10px] mt-1 leading-relaxed" style={{ color: "#64748b" }}>
                {f.hint}
              </p>
            )}
          </div>
        );
      })}

      {error && (
        <div
          className="rounded-xl px-3 py-2 text-[11px] leading-relaxed"
          style={{
            backgroundColor: "rgba(239,68,68,0.07)",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.15)",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
        style={{
          backgroundColor: "rgba(59,130,246,0.18)",
          border: "1px solid rgba(59,130,246,0.4)",
        }}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Save &amp; validate
      </button>
    </div>
  );
}

interface DeleteConfirmProps {
  user: User | null;
  deploymentId: string;
  exchangeLabel: string;
  openTradesCount: number;
  onCancel: () => void;
  onDeleted: () => void;
}

function DeleteConfirm({
  user,
  deploymentId,
  exchangeLabel,
  openTradesCount,
  onCancel,
  onDeleted,
}: DeleteConfirmProps) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/delete-deployment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ deploymentId, confirm: "DELETE" }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl p-6"
        style={{
          backgroundColor: "#0a1628",
          border: "1px solid rgba(239,68,68,0.3)",
        }}
      >
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <Trash2 className="h-7 w-7" style={{ color: "#f87171" }} />
        </div>
        <h3 className="text-lg font-black text-white mb-2 text-center">
          Delete this bot?
        </h3>
        <p className="text-sm mb-4 leading-relaxed text-center" style={{ color: "#94a3b8" }}>
          {openTradesCount > 0 ? (
            <>
              We will market-close{" "}
              <span className="text-white font-bold">
                {openTradesCount} open trade{openTradesCount === 1 ? "" : "s"}
              </span>{" "}
              on {exchangeLabel}, cancel residual exit orders, and remove your API
              keys.
            </>
          ) : (
            <>
              We will remove your API keys for {exchangeLabel} from our database.
            </>
          )}{" "}
          <span className="text-rose-300 font-semibold">This cannot be undone.</span>
        </p>

        <label
          className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
          style={{ color: "#64748b" }}
        >
          Type <span className="text-rose-300">DELETE</span> to confirm
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          autoFocus
          className="w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition-colors focus:border-rose-400/40 mb-3"
          style={{
            backgroundColor: "#060d1a",
            color: "#f0f4ff",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        />

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-[11px] leading-relaxed mb-3"
            style={{
              backgroundColor: "rgba(239,68,68,0.07)",
              color: "#fca5a5",
              border: "1px solid rgba(239,68,68,0.15)",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl text-sm font-bold transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "rgba(90,140,220,0.08)",
              color: "#64748b",
              border: "1px solid rgba(90,140,220,0.12)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || confirmText !== "DELETE"}
            className="flex-1 py-3 rounded-2xl text-sm font-bold transition-all disabled:opacity-30"
            style={{
              backgroundColor: "rgba(239,68,68,0.18)",
              border: "1px solid rgba(239,68,68,0.35)",
              color: "#f87171",
            }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              "Delete bot"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
