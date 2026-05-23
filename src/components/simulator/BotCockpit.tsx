"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { doc } from "firebase/firestore";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { SIM_PANEL } from "@/components/simulator/simulator-surfaces";
import { SIM_COCKPIT_BOTS, type CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  computeBotCapital,
  countBotClosed,
  countBotOpen,
} from "@/lib/sim-bot-metrics";
import type { SimTrade, SimulatorState } from "@/lib/simulator";
import type { ZoneBotState } from "@/lib/zone-bot-state";
import {
  ZONE_BOT_STARTING_CAPITAL_USD,
  type ZoneBotAsset,
  type ZoneBotSettings,
} from "@/lib/zone-bot-config";
import { HeatmapAssetCard } from "@/components/simulator/HeatmapAssetCard";
import { CockpitCompactRow } from "@/components/simulator/CockpitCompactRow";
import { BotCardControls } from "@/components/simulator/BotCardControls";
import {
  liveSpotFromExchangePrices,
  normalizeSuggestedZones,
  spotFromSuggested,
  type SuggestedZonesSnapshot,
} from "@/components/simulator/heatmap-types";

interface BtcMacroStatus {
  btcPrice: number | null;
  simEnabled: boolean;
  directionBias: string;
  reason?: string;
  updatedAt?: string;
}

/**
 * Cockpit master-detail layout — replaces the older 4-up grid.
 *
 *   ┌──── left rail (sticky) ────┐  ┌──── right pane ───────────────────┐
 *   │ ▣ Crypto Bot   AUTO   $77k │  │ Selected bot detail card          │
 *   │ ▣ BTC Zone    AUTO   $77k │  │   • full status banner            │
 *   │ ▣ ETH Zone    AUTO   $2.1k│  │   • zone tiles (or pattern signals│
 *   │ ▣ SOL Zone    AUTO   $86  │  │     for Crypto Bot)               │
 *   │ ▣ XRP Zone    AUTO   $1.4 │  │   • max-pain by expiry            │
 *   └────────────────────────────┘  ├───────────────────────────────────┤
 *                                   │ Tabs: Open / History / Logs       │
 *                                   │ (children prop — page owns state) │
 *                                   └───────────────────────────────────┘
 *
 * One row in the rail tells you everything you need to scan all five bots
 * at once; clicking a row routes the selection both to the detail card
 * and to the tabs underneath (the page filters open trades / history /
 * logs by botSource via the same `selectedBotId`).
 */
export function BotCockpit({
  openTrades,
  closedTrades,
  startingCapital,
  cs,
  selectedBotId,
  onSelectBot,
  children,
}: {
  openTrades: SimTrade[];
  closedTrades: SimTrade[];
  startingCapital: number;
  cs: string;
  selectedBotId: CockpitBotId;
  onSelectBot: (id: CockpitBotId) => void;
  /** Right-pane tab panel (Open / History / Logs) — page owns the tab state */
  children: React.ReactNode;
}) {
  const firestore = useFirestore();
  const [refreshing, setRefreshing] = useState(false);
  const refetchersRef = useRef<Record<string, () => void>>({});

  const macroRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "heatmap_auto_status");
  }, [firestore]);
  const { data: macroData, refetch: refetchMacro } = useDoc(macroRef);
  const cryptoMacro = macroData as BtcMacroStatus | null;

  const heatmapZonesRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "heatmap_zones");
  }, [firestore]);
  const { data: heatmapZonesData, refetch: refetchHeatmapZones } = useDoc(heatmapZonesRef);
  const heatmapZones = heatmapZonesData as ZoneBotSettings | null;

  // Live spot feed — `sync-prices` cron writes every 1 min, contains
  // BYBIT / BINANCE / etc. per-symbol LTPs. The old code derived spot
  // from `suggested_zones_*.deribitIndexPrice`, which only refreshes
  // every 15 min (or on Refresh All). Subscribing here gives every
  // card a price that ticks once per minute via Firestore push.
  const exchangePricesRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "exchange_prices");
  }, [firestore]);
  const { data: exchangePricesData, refetch: refetchExchangePrices } = useDoc(exchangePricesRef);
  const exchangePrices = exchangePricesData as Record<string, unknown> | null;

  // ── Per-bot Firestore refs (4 zone bots × 3 docs + 5 suggested-zones)
  const zoneStateRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      (["btc", "eth", "sol", "xrp"] as ZoneBotAsset[]).map((a) => [
        a,
        doc(firestore, "config", `zone_bot_${a}_state`),
      ]),
    );
  }, [firestore]);

  const zoneSettingsRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      (["btc", "eth", "sol", "xrp"] as ZoneBotAsset[]).map((a) => [
        a,
        a === "btc"
          ? doc(firestore, "config", "heatmap_zones")
          : doc(firestore, "config", `zone_bot_${a}_settings`),
      ]),
    );
  }, [firestore]);

  const zoneSimStateRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      (["btc", "eth", "sol", "xrp"] as ZoneBotAsset[]).map((a) => [
        a,
        doc(firestore, "config", `zone_sim_state_${a}`),
      ]),
    );
  }, [firestore]);

  const suggestedRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => [
        b.id,
        doc(firestore, "config", b.suggestedDoc),
      ]),
    );
  }, [firestore]);

  // Hooks must be called unconditionally and in the same order on every
  // render, so we spell out each subscription rather than .map-ing.
  const { data: btcStateData, refetch: refetchBtcState } = useDoc(zoneStateRefs.btc ?? null);
  const { data: ethStateData, refetch: refetchEthState } = useDoc(zoneStateRefs.eth ?? null);
  const { data: solStateData, refetch: refetchSolState } = useDoc(zoneStateRefs.sol ?? null);
  const { data: xrpStateData, refetch: refetchXrpState } = useDoc(zoneStateRefs.xrp ?? null);

  const { data: ethSettingsData, refetch: refetchEthSettings } = useDoc(zoneSettingsRefs.eth ?? null);
  const { data: solSettingsData, refetch: refetchSolSettings } = useDoc(zoneSettingsRefs.sol ?? null);
  const { data: xrpSettingsData, refetch: refetchXrpSettings } = useDoc(zoneSettingsRefs.xrp ?? null);

  const { data: btcSimData, refetch: refetchBtcSim } = useDoc(zoneSimStateRefs.btc ?? null);
  const { data: ethSimData, refetch: refetchEthSim } = useDoc(zoneSimStateRefs.eth ?? null);
  const { data: solSimData, refetch: refetchSolSim } = useDoc(zoneSimStateRefs.sol ?? null);
  const { data: xrpSimData, refetch: refetchXrpSim } = useDoc(zoneSimStateRefs.xrp ?? null);

  const { data: cryptoSuggestedData, refetch: refetchCryptoSuggested } = useDoc(suggestedRefs.crypto ?? null);
  const { data: btcSuggestedData, refetch: refetchBtcSuggested } = useDoc(suggestedRefs.btc ?? null);
  const { data: ethSuggestedData, refetch: refetchEthSuggested } = useDoc(suggestedRefs.eth ?? null);
  const { data: solSuggestedData, refetch: refetchSolSuggested } = useDoc(suggestedRefs.sol ?? null);
  const { data: xrpSuggestedData, refetch: refetchXrpSuggested } = useDoc(suggestedRefs.xrp ?? null);

  // Per-bot trading policy (discovery + sim/live mode). Subscribing here so
  // a flip in the Config sheet propagates to every card instantly without
  // a page refresh. Each doc is `config/sim_bot_<id>_settings`; the parser
  // (`parseSimBotSettings`) lives server-side, so on the client we just
  // read the raw boolean fields.
  const policyRefs = useMemo(() => {
    if (!firestore) return {} as Record<CockpitBotId, ReturnType<typeof doc>>;
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => [
        b.id,
        doc(firestore, "config", `sim_bot_${b.id}_settings`),
      ]),
    ) as Record<CockpitBotId, ReturnType<typeof doc>>;
  }, [firestore]);

  const { data: cryptoPolicyData, refetch: refetchCryptoPolicy } = useDoc(policyRefs.crypto ?? null);
  const { data: btcPolicyData, refetch: refetchBtcPolicy } = useDoc(policyRefs.btc ?? null);
  const { data: ethPolicyData, refetch: refetchEthPolicy } = useDoc(policyRefs.eth ?? null);
  const { data: solPolicyData, refetch: refetchSolPolicy } = useDoc(policyRefs.sol ?? null);
  const { data: xrpPolicyData, refetch: refetchXrpPolicy } = useDoc(policyRefs.xrp ?? null);

  const refetchAll = useCallback(() => {
    void refetchMacro();
    void refetchHeatmapZones();
    void refetchExchangePrices();
    void refetchBtcState();
    void refetchEthState();
    void refetchSolState();
    void refetchXrpState();
    void refetchEthSettings();
    void refetchSolSettings();
    void refetchXrpSettings();
    void refetchBtcSim();
    void refetchEthSim();
    void refetchSolSim();
    void refetchXrpSim();
    void refetchCryptoSuggested();
    void refetchBtcSuggested();
    void refetchEthSuggested();
    void refetchSolSuggested();
    void refetchXrpSuggested();
    void refetchCryptoPolicy();
    void refetchBtcPolicy();
    void refetchEthPolicy();
    void refetchSolPolicy();
    void refetchXrpPolicy();
    Object.values(refetchersRef.current).forEach((fn) => void fn());
  }, [
    refetchMacro,
    refetchHeatmapZones,
    refetchExchangePrices,
    refetchBtcState,
    refetchEthState,
    refetchSolState,
    refetchXrpState,
    refetchEthSettings,
    refetchSolSettings,
    refetchXrpSettings,
    refetchBtcSim,
    refetchEthSim,
    refetchSolSim,
    refetchXrpSim,
    refetchCryptoSuggested,
    refetchCryptoPolicy,
    refetchBtcPolicy,
    refetchEthPolicy,
    refetchSolPolicy,
    refetchXrpPolicy,
    refetchBtcSuggested,
    refetchEthSuggested,
    refetchSolSuggested,
    refetchXrpSuggested,
  ]);

  useAutoRefresh([refetchAll], 60_000);

  const handleRefreshZones = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/cron/suggest-zones", { method: "POST" });
      refetchAll();
    } catch (e) {
      console.error("[BotCockpit] refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAll]);

  const suggestedByBot = useMemo(() => {
    const norm = (d: unknown): SuggestedZonesSnapshot | null =>
      normalizeSuggestedZones(d as Record<string, unknown> | null | undefined);
    return {
      crypto: norm(cryptoSuggestedData),
      btc: norm(btcSuggestedData),
      eth: norm(ethSuggestedData),
      sol: norm(solSuggestedData),
      xrp: norm(xrpSuggestedData),
    } as Record<CockpitBotId, SuggestedZonesSnapshot | null>;
  }, [
    cryptoSuggestedData,
    btcSuggestedData,
    ethSuggestedData,
    solSuggestedData,
    xrpSuggestedData,
  ]);

  // Per-bot live spot — fresh from `config/exchange_prices` (1-min cron)
  // with a fallback to whatever `suggested_zones_*` last cached. Without
  // this fallback, a missing exchange feed during cron downtime would
  // blank the price; with it, we degrade gracefully to the 15-min snapshot.
  const liveSpotByBot = useMemo(() => {
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => [
        b.id,
        liveSpotFromExchangePrices(exchangePrices, b.id) ??
          spotFromSuggested(suggestedByBot[b.id]),
      ]),
    ) as Record<CockpitBotId, number | null>;
  }, [exchangePrices, suggestedByBot]);

  const zoneSimById = useMemo(
    () => ({
      btc: btcSimData as SimulatorState | null,
      eth: ethSimData as SimulatorState | null,
      sol: solSimData as SimulatorState | null,
      xrp: xrpSimData as SimulatorState | null,
    }),
    [btcSimData, ethSimData, solSimData, xrpSimData],
  );

  // Per-bot trading policy — the two boolean fields the card needs to
  // render. Centralised here so the left rail (compact row) and the
  // right pane (detail card) can both read from one source. Missing /
  // unset field semantics:
  //   • publicLive            → undefined treated as false (privacy-safe)
  //   • liveMirroringEnabled  → undefined treated as TRUE (legacy bots
  //                              keep mirroring on deploy with no
  //                              migration; only an explicit false from
  //                              the cockpit UI opts into SIM_ONLY).
  const policyByBot = useMemo(() => {
    const read = (raw: unknown): { publicLive: boolean; liveMirroringEnabled: boolean } => {
      const r = (raw ?? {}) as { publicLive?: unknown; liveMirroringEnabled?: unknown };
      return {
        publicLive: r.publicLive === true,
        liveMirroringEnabled: r.liveMirroringEnabled !== false,
      };
    };
    return {
      crypto: read(cryptoPolicyData),
      btc: read(btcPolicyData),
      eth: read(ethPolicyData),
      sol: read(solPolicyData),
      xrp: read(xrpPolicyData),
    } as Record<CockpitBotId, { publicLive: boolean; liveMirroringEnabled: boolean }>;
  }, [cryptoPolicyData, btcPolicyData, ethPolicyData, solPolicyData, xrpPolicyData]);

  const botMetrics = useMemo(() => {
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => {
        const zoneSim =
          b.id === "btc" || b.id === "eth" || b.id === "sol" || b.id === "xrp"
            ? zoneSimById[b.id]
            : null;
        const capital =
          b.id === "crypto"
            ? computeBotCapital(closedTrades, startingCapital, b.botSource)
            : zoneSim?.capital ??
              computeBotCapital(
                closedTrades,
                ZONE_BOT_STARTING_CAPITAL_USD,
                b.botSource,
              );
        return [
          b.id,
          {
            capital,
            liveCount: countBotOpen(openTrades, b.botSource),
            closedCount: countBotClosed(closedTrades, b.botSource),
          },
        ];
      }),
    ) as Record<
      CockpitBotId,
      { capital: number; liveCount: number; closedCount: number }
    >;
  }, [closedTrades, openTrades, startingCapital, zoneSimById]);

  const zoneContext = useMemo(
    () => ({
      btc: {
        state: btcStateData as ZoneBotState | null,
        settings: heatmapZones,
      },
      eth: {
        state: ethStateData as ZoneBotState | null,
        settings: ethSettingsData as ZoneBotSettings | null,
      },
      sol: {
        state: solStateData as ZoneBotState | null,
        settings: solSettingsData as ZoneBotSettings | null,
      },
      xrp: {
        state: xrpStateData as ZoneBotState | null,
        settings: xrpSettingsData as ZoneBotSettings | null,
      },
    }),
    [
      btcStateData,
      ethStateData,
      solStateData,
      xrpStateData,
      heatmapZones,
      ethSettingsData,
      solSettingsData,
      xrpSettingsData,
    ],
  );

  const selectedBot = useMemo(
    () => SIM_COCKPIT_BOTS.find((b) => b.id === selectedBotId) ?? SIM_COCKPIT_BOTS[0],
    [selectedBotId],
  );
  const selectedSuggested = suggestedByBot[selectedBotId];
  const selectedMetrics = botMetrics[selectedBotId];
  const selectedZone =
    selectedBotId === "crypto"
      ? { state: null as ZoneBotState | null, settings: heatmapZones }
      : zoneContext[selectedBotId as ZoneBotAsset];

  // Auto-fall-forward: if the page hands us a bot id we don't know about
  // (shouldn't happen, but guards against stale localStorage), nudge it
  // back to crypto so the right pane never renders empty.
  useEffect(() => {
    if (!SIM_COCKPIT_BOTS.some((b) => b.id === selectedBotId)) {
      onSelectBot("crypto");
    }
  }, [selectedBotId, onSelectBot]);

  return (
    <section className={cn(SIM_PANEL, "p-3 sm:p-4 space-y-3 sm:space-y-4")}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent/70" />
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-foreground/85">
              Bot cockpit
            </h2>
            <p className="text-[10px] text-muted-foreground/45">
              Five Deribit zone bots · pick one on the left to drill in
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleRefreshZones()}
          disabled={refreshing}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#1a1a1f]",
            "px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
            "shadow-[0_2px_10px_rgba(0,0,0,0.35)] hover:text-foreground hover:bg-[#222228] hover:border-white/[0.18] transition-all disabled:opacity-40",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Fetching…" : "Refresh all"}
        </button>
      </div>

      {/* ── Master-detail body ── */}
      <div className="flex flex-col lg:flex-row gap-3 sm:gap-4">
        {/* Left rail */}
        <aside className="w-full lg:w-72 lg:shrink-0 space-y-2">
          {SIM_COCKPIT_BOTS.map((bot) => {
            const metrics = botMetrics[bot.id];
            const zc =
              bot.id === "crypto"
                ? { state: null, settings: heatmapZones }
                : zoneContext[bot.id as ZoneBotAsset];
            const isCrypto = bot.id === "crypto";
            const engineLive = isCrypto
              ? !!cryptoMacro?.updatedAt
              : !!zc?.state?.updatedAt;
            return (
              <CockpitCompactRow
                key={bot.id}
                botId={bot.id}
                label={bot.label}
                suggested={suggestedByBot[bot.id]}
                liveSpot={liveSpotByBot[bot.id]}
                manualOverride={zc?.settings?.manualOverride ?? null}
                engineReason={
                  isCrypto
                    ? cryptoMacro?.reason ?? null
                    : zc?.state?.reason ?? null
                }
                engineDirection={isCrypto ? null : zc?.state?.direction ?? null}
                simEnabled={isCrypto ? cryptoMacro?.simEnabled : undefined}
                botEngineLive={engineLive}
                liveCount={metrics?.liveCount ?? 0}
                closedCount={metrics?.closedCount ?? 0}
                publicLive={policyByBot[bot.id]?.publicLive ?? false}
                liveMirroringEnabled={policyByBot[bot.id]?.liveMirroringEnabled ?? true}
                selected={selectedBotId === bot.id}
                onSelect={() => onSelectBot(bot.id)}
              />
            );
          })}
        </aside>

        {/* Right pane — single card: detail header + tabs in one section */}
        <div className="flex-1 min-w-0">
          <HeatmapAssetCard
            botId={selectedBot.id}
            label={selectedBot.label}
            suggested={selectedSuggested}
            liveSpot={liveSpotByBot[selectedBot.id]}
            manualOverride={selectedZone?.settings?.manualOverride ?? null}
            publicLive={policyByBot[selectedBot.id]?.publicLive ?? false}
            liveMirroringEnabled={policyByBot[selectedBot.id]?.liveMirroringEnabled ?? true}
            engineReason={
              selectedBot.id === "crypto"
                ? cryptoMacro?.reason ?? null
                : selectedZone?.state?.reason ?? null
            }
            engineDirection={
              selectedBot.id === "crypto"
                ? null
                : selectedZone?.state?.direction ?? null
            }
            simEnabled={
              selectedBot.id === "crypto" ? cryptoMacro?.simEnabled : undefined
            }
            botEngineLive={
              selectedBot.id === "crypto"
                ? !!cryptoMacro?.updatedAt
                : !!selectedZone?.state?.updatedAt
            }
            botLastRanAt={
              selectedBot.id === "crypto"
                ? cryptoMacro?.updatedAt ?? null
                : selectedZone?.state?.updatedAt ?? null
            }
            zonesRefreshedAt={selectedSuggested?.computedAt ?? null}
            capital={selectedMetrics?.capital ?? startingCapital}
            startingCapital={startingCapital}
            liveCount={selectedMetrics?.liveCount ?? 0}
            cs={cs}
            settingsSlot={
              <BotCardControls
                botId={selectedBot.id}
                label={selectedBot.label}
                capital={selectedMetrics?.capital ?? startingCapital}
                suggested={selectedSuggested}
                onTradeOpened={refetchAll}
              />
            }
            footerSlot={children}
          />
        </div>
      </div>
    </section>
  );
}
