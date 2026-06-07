"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { doc } from "firebase/firestore";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { SIM_PANEL } from "@/components/simulator/simulator-surfaces";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
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
import { SimBotStrip } from "@/components/simulator/SimBotStrip";
import { BotCardControls } from "@/components/simulator/BotCardControls";
import {
  LEVELS_STRIP_ICON_BOX_CLASS,
  LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS,
} from "@/components/levels/levels-symbol-strip";
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
 * Cockpit slideshow layout — mirrors freedombot levels slideshow.
 *
 *   ┌─ [Refresh] │ Crypto │ BTC │ ETH │ SOL │ XRP ────────────────┐
 *   ├────────────────────────────────────┬────────────────────────┤
 *   │ Zone ladder + controls (70%)       │ Open / History / Logs  │
 *   │                                    │ sim & live trades (30%)│
 *   └────────────────────────────────────┴────────────────────────┘
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

  const stripItems = useMemo(
    () =>
      SIM_COCKPIT_BOTS.map((bot) => {
        const isCrypto = bot.id === "crypto";
        const zc =
          bot.id === "crypto"
            ? { state: null, settings: heatmapZones }
            : zoneContext[bot.id as ZoneBotAsset];
        const meta = CRYPTO_BOTS.find((b) => b.id === bot.id);
        return {
          id: bot.id,
          label: bot.label,
          shortLabel: meta?.shortLabel ?? bot.label,
          suggested: suggestedByBot[bot.id],
          liveSpot: liveSpotByBot[bot.id],
          manualOverride: zc?.settings?.manualOverride ?? null,
          engineReason: isCrypto
            ? cryptoMacro?.reason ?? null
            : zc?.state?.reason ?? null,
          engineDirection: isCrypto ? null : zc?.state?.direction ?? null,
          simEnabled: isCrypto ? cryptoMacro?.simEnabled : undefined,
          botEngineLive: isCrypto
            ? !!cryptoMacro?.updatedAt
            : !!zc?.state?.updatedAt,
          liveCount: botMetrics[bot.id]?.liveCount ?? 0,
        };
      }),
    [
      suggestedByBot,
      liveSpotByBot,
      heatmapZones,
      zoneContext,
      cryptoMacro,
      botMetrics,
    ],
  );

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
    <section
      className={cn(
        SIM_PANEL,
        "flex flex-col flex-1 min-h-0 p-2 sm:p-3 gap-1.5 sm:gap-2 overflow-hidden",
      )}
    >
      {/* ── Bot strip (top) ── */}
      <div
        className={cn(
          "shrink-0 flex items-stretch gap-1.5",
          LEVELS_SYMBOL_STRIP_ROW_HEIGHT_CLASS,
        )}
      >
        <button
          type="button"
          onClick={() => void handleRefreshZones()}
          disabled={refreshing}
          title={refreshing ? "Fetching zones…" : "Refresh all zones"}
          className={cn(
            LEVELS_STRIP_ICON_BOX_CLASS,
            "flex flex-col items-center justify-center gap-1.5 rounded-lg",
            "border border-white/[0.1] bg-[#1a1a1f] text-muted-foreground",
            "hover:text-foreground hover:bg-[#222228] hover:border-white/[0.18] transition-all disabled:opacity-40",
          )}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          <span className="text-[10px] font-bold leading-none tracking-wide">
            {refreshing ? "…" : "Refresh"}
          </span>
        </button>
        <SimBotStrip
          items={stripItems}
          selectedId={selectedBotId}
          onSelect={onSelectBot}
        />
      </div>

      {/* ── Chart left · trades right ── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-2 sm:gap-3 lg:gap-4">
        <div className="flex flex-col lg:w-1/2 lg:min-w-0 flex-1 lg:min-h-0 min-h-[40dvh]">
          <HeatmapAssetCard
            botId={selectedBot.id}
            label={selectedBot.label}
            suggested={selectedSuggested}
            liveSpot={liveSpotByBot[selectedBot.id]}
            manualOverride={selectedZone?.settings?.manualOverride ?? null}
            publicLive={policyByBot[selectedBot.id]?.publicLive ?? false}
            liveMirroringEnabled={
              policyByBot[selectedBot.id]?.liveMirroringEnabled ?? true
            }
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
            hideCarousel
            settingsSlot={
              <BotCardControls
                botId={selectedBot.id}
                label={selectedBot.label}
                capital={selectedMetrics?.capital ?? startingCapital}
                suggested={selectedSuggested}
                onTradeOpened={refetchAll}
                stacked={false}
              />
            }
          />
        </div>

        {children && (
          <>
            <div className="hidden lg:block w-px shrink-0 bg-white/[0.08] self-stretch" />
            <div className="flex flex-col lg:w-1/2 lg:min-w-0 min-h-[min(36dvh,320px)] lg:min-h-0 rounded-xl border border-white/[0.1] bg-[#101013] overflow-hidden">
              {children}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
