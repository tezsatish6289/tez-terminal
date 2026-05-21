"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { doc, type DocumentReference } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { SIM_PANEL } from "@/components/simulator/simulator-surfaces";
import { SIM_COCKPIT_BOTS, type CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  computeBotCapital,
  countBotClosed,
  countBotOpen,
} from "@/lib/sim-bot-metrics";
import type { SimTrade } from "@/lib/simulator";
import { HeatmapAssetCard } from "@/components/simulator/HeatmapAssetCard";
import { normalizeSuggestedZones } from "@/components/simulator/heatmap-types";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { BotCardControls } from "@/components/simulator/BotCardControls";
import {
  cryptoBotStatus,
  zoneBotStatus,
  type CockpitBotStatus,
} from "@/lib/cockpit-bot-status";
import type { ZoneBotState } from "@/lib/zone-bot-state";
import type { ZoneBotSettings } from "@/lib/zone-bot-config";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";
import { ZONE_BOT_STARTING_CAPITAL_USD } from "@/lib/zone-bot-config";
import type { SimulatorState } from "@/lib/simulator";

interface BtcMacroStatus {
  btcPrice: number | null;
  simEnabled: boolean;
  directionBias: string;
  reason?: string;
  updatedAt?: string;
}

const DEFAULT_STATUS: CockpitBotStatus = { power: "idle", label: "Bot OFF" };

function HeatmapBotColumn({
  bot,
  docRef,
  capital,
  liveCount,
  closedCount,
  cs,
  onRegisterRefetch,
  cryptoMacro,
  zoneState,
  zoneSettings,
  selected,
  onSelect,
  onTradeOpened,
}: {
  bot: (typeof SIM_COCKPIT_BOTS)[number];
  docRef: DocumentReference | null;
  capital: number;
  liveCount: number;
  closedCount: number;
  cs: string;
  onRegisterRefetch: (fn: () => void) => void;
  cryptoMacro: BtcMacroStatus | null;
  zoneState: ZoneBotState | null;
  zoneSettings: ZoneBotSettings | null;
  selected: boolean;
  onSelect: () => void;
  onTradeOpened?: () => void;
}) {
  const { data, refetch } = useDoc(docRef);
  const suggested = normalizeSuggestedZones(
    data as Record<string, unknown> | null | undefined,
  );
  const [botStatus, setBotStatus] = useState<CockpitBotStatus>(DEFAULT_STATUS);

  useEffect(() => {
    onRegisterRefetch(refetch);
  }, [refetch, onRegisterRefetch]);

  // Keep ON/OFF in sync with Firestore even before opening the settings sheet.
  useEffect(() => {
    if (bot.id === "crypto") {
      setBotStatus(
        cryptoBotStatus(
          zoneSettings ?? { manualOverride: "AUTO" },
          cryptoMacro,
        ),
      );
    } else {
      setBotStatus(zoneBotStatus(zoneSettings, zoneState));
    }
  }, [bot.id, cryptoMacro, zoneState, zoneSettings]);

  return (
    <div className="h-full min-h-[448px]">
      <HeatmapAssetCard
        botId={bot.id}
        label={bot.label}
        suggested={suggested}
        manualOverride={zoneSettings?.manualOverride ?? null}
        engineReason={
          bot.id === "crypto"
            ? cryptoMacro?.reason ?? null
            : zoneState?.reason ?? null
        }
        engineDirection={
          bot.id === "crypto" ? null : (zoneState?.direction ?? null)
        }
        simEnabled={bot.id === "crypto" ? cryptoMacro?.simEnabled : undefined}
        botEngineLive={
          bot.id === "crypto"
            ? !!cryptoMacro?.updatedAt
            : !!zoneState?.updatedAt
        }
        botLastRanAt={
          bot.id === "crypto"
            ? cryptoMacro?.updatedAt ?? null
            : zoneState?.updatedAt ?? null
        }
        zonesRefreshedAt={suggested?.computedAt ?? null}
        capital={capital}
        liveCount={liveCount}
        closedCount={closedCount}
        cs={cs}
        settingsSlot={
          <BotCardControls
            botId={bot.id}
            label={bot.label}
            capital={capital}
            suggested={suggested}
            maxPainMinDistanceUsd={zoneSettings?.maxPainMinDistanceUsd ?? null}
            onStatusChange={setBotStatus}
            onTradeOpened={onTradeOpened}
          />
        }
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}

/** Crypto Bot + BTC / ETH / SOL zone heatmaps (Deribit OI, one cron refresh). */
export function HeatmapGrid({
  openTrades,
  closedTrades,
  startingCapital,
  cs,
  selectedBotId,
  onSelectBot,
}: {
  openTrades: SimTrade[];
  closedTrades: SimTrade[];
  startingCapital: number;
  cs: string;
  selectedBotId: CockpitBotId;
  onSelectBot: (id: CockpitBotId) => void;
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

  const zoneStateRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      (["btc", "eth", "sol"] as ZoneBotAsset[]).map((a) => [
        a,
        doc(firestore, "config", `zone_bot_${a}_state`),
      ]),
    );
  }, [firestore]);

  const zoneSettingsRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      (["btc", "eth", "sol"] as ZoneBotAsset[]).map((a) => [
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
      (["btc", "eth", "sol"] as ZoneBotAsset[]).map((a) => [
        a,
        doc(firestore, "config", `zone_sim_state_${a}`),
      ]),
    );
  }, [firestore]);

  const btcStateRef = zoneStateRefs.btc;
  const ethStateRef = zoneStateRefs.eth;
  const solStateRef = zoneStateRefs.sol;
  const ethSettingsRef = zoneSettingsRefs.eth;
  const solSettingsRef = zoneSettingsRefs.sol;

  const { data: btcStateData, refetch: refetchBtcState } = useDoc(btcStateRef ?? null);
  const { data: ethStateData, refetch: refetchEthState } = useDoc(ethStateRef ?? null);
  const { data: solStateData, refetch: refetchSolState } = useDoc(solStateRef ?? null);
  const { data: ethSettingsData, refetch: refetchEthSettings } = useDoc(ethSettingsRef ?? null);
  const { data: solSettingsData, refetch: refetchSolSettings } = useDoc(solSettingsRef ?? null);

  const { data: btcSimData, refetch: refetchBtcSim } = useDoc(zoneSimStateRefs.btc ?? null);
  const { data: ethSimData, refetch: refetchEthSim } = useDoc(zoneSimStateRefs.eth ?? null);
  const { data: solSimData, refetch: refetchSolSim } = useDoc(zoneSimStateRefs.sol ?? null);

  const docRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => [b.id, doc(firestore, "config", b.suggestedDoc)]),
    );
  }, [firestore]);

  const refetchAll = useCallback(() => {
    void refetchMacro();
    void refetchHeatmapZones();
    void refetchBtcState();
    void refetchEthState();
    void refetchSolState();
    void refetchEthSettings();
    void refetchSolSettings();
    void refetchBtcSim();
    void refetchEthSim();
    void refetchSolSim();
    Object.values(refetchersRef.current).forEach((fn) => void fn());
  }, [
    refetchMacro,
    refetchHeatmapZones,
    refetchBtcState,
    refetchEthState,
    refetchSolState,
    refetchEthSettings,
    refetchSolSettings,
    refetchBtcSim,
    refetchEthSim,
    refetchSolSim,
  ]);

  useAutoRefresh([refetchAll], 60_000);

  const handleRefreshZones = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/cron/suggest-zones", { method: "POST" });
      refetchAll();
    } catch (e) {
      console.error("[HeatmapGrid] refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAll]);

  const zoneSimById = useMemo(
    () => ({
      btc: btcSimData as SimulatorState | null,
      eth: ethSimData as SimulatorState | null,
      sol: solSimData as SimulatorState | null,
    }),
    [btcSimData, ethSimData, solSimData],
  );

  const botMetrics = useMemo(() => {
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => {
        const zoneSim =
          b.id === "btc" || b.id === "eth" || b.id === "sol"
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
    );
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
    }),
    [btcStateData, ethStateData, solStateData, heatmapZones, ethSettingsData, solSettingsData],
  );

  const registerRefetch = useCallback(
    (id: string) => (fn: () => void) => {
      refetchersRef.current[id] = fn;
    },
    [],
  );

  return (
    <section className={cn(SIM_PANEL, "p-4 space-y-4")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent/70" />
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-foreground/85">
              Deribit zone heatmaps
            </h2>
            <p className="text-[10px] text-muted-foreground/45">
              Heatmap-only bots · config &amp; ON/OFF per card · one Refresh all cron
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
        {SIM_COCKPIT_BOTS.map((b) => {
          const zc =
            b.id === "crypto"
              ? { state: null, settings: heatmapZones }
              : zoneContext[b.id as ZoneBotAsset];
          return (
            <HeatmapBotColumn
              key={b.id}
              bot={b}
              docRef={docRefs[b.id] ?? null}
              capital={botMetrics[b.id]?.capital ?? startingCapital}
              liveCount={botMetrics[b.id]?.liveCount ?? 0}
              closedCount={botMetrics[b.id]?.closedCount ?? 0}
              cs={cs}
              cryptoMacro={b.id === "crypto" ? cryptoMacro : null}
              zoneState={zc?.state ?? null}
              zoneSettings={zc?.settings ?? null}
              onRegisterRefetch={registerRefetch(b.id)}
              selected={selectedBotId === b.id}
              onSelect={() => onSelectBot(b.id)}
              onTradeOpened={refetchAll}
            />
          );
        })}
      </div>
    </section>
  );
}
