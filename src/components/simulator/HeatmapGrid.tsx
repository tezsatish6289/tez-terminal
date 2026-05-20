"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { doc, type DocumentReference } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { SIM_PANEL } from "@/components/simulator/simulator-surfaces";
import { SIM_COCKPIT_BOTS } from "@/lib/sim-cockpit-bots";
import { computeBotCapital, countBotOpen } from "@/lib/sim-bot-metrics";
import type { SimTrade } from "@/lib/simulator";
import { HeatmapAssetCard } from "@/components/simulator/HeatmapAssetCard";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { HeatmapAutoSwitch } from "@/components/simulator/HeatmapAutoSwitch";

interface BtcMacroStatus {
  btcPrice: number | null;
  simEnabled: boolean;
  directionBias: string;
  reason: string;
}

function HeatmapBotColumn({
  bot,
  docRef,
  macroLine,
  capital,
  openCount,
  cs,
  onRegisterRefetch,
}: {
  bot: (typeof SIM_COCKPIT_BOTS)[number];
  docRef: DocumentReference | null;
  macroLine?: string | null;
  capital: number;
  openCount: number;
  cs: string;
  onRegisterRefetch: (fn: () => void) => void;
}) {
  const { data, refetch } = useDoc(docRef);
  const suggested = data as SuggestedZonesSnapshot | null;

  useEffect(() => {
    onRegisterRefetch(refetch);
  }, [refetch, onRegisterRefetch]);

  return (
    <HeatmapAssetCard
      botId={bot.id}
      label={bot.label}
      suggested={suggested}
      macroLine={macroLine}
      capital={capital}
      openCount={openCount}
      cs={cs}
      settingsSlot={
        bot.id === "crypto" ? (
          <div className="shrink-0">
            <HeatmapAutoSwitch />
          </div>
        ) : undefined
      }
    />
  );
}

/** Crypto Bot + BTC / ETH / SOL zone heatmaps (Deribit OI, one cron refresh). */
export function HeatmapGrid({
  openTrades,
  closedTrades,
  startingCapital,
  cs,
}: {
  openTrades: SimTrade[];
  closedTrades: SimTrade[];
  startingCapital: number;
  cs: string;
}) {
  const firestore = useFirestore();
  const [refreshing, setRefreshing] = useState(false);
  const refetchersRef = useRef<Record<string, () => void>>({});

  const statusRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "heatmap_auto_status");
  }, [firestore]);

  const { data: statusData, refetch: refetchStatus } = useDoc(statusRef);
  const macro = statusData as BtcMacroStatus | null;

  const docRefs = useMemo(() => {
    if (!firestore) return {};
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => [b.id, doc(firestore, "config", b.suggestedDoc)]),
    );
  }, [firestore]);

  const refetchAll = useCallback(() => {
    void refetchStatus();
    Object.values(refetchersRef.current).forEach((fn) => void fn());
  }, [refetchStatus]);

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

  const cryptoMacroLine = useMemo(() => {
    if (!macro) return null;
    return macro.simEnabled
      ? `Bot ON · ${macro.directionBias}`
      : "Bot OFF";
  }, [macro]);

  const botMetrics = useMemo(() => {
    return Object.fromEntries(
      SIM_COCKPIT_BOTS.map((b) => [
        b.id,
        {
          capital: computeBotCapital(closedTrades, startingCapital, b.botSource),
          openCount: countBotOpen(openTrades, b.botSource),
        },
      ]),
    );
  }, [closedTrades, openTrades, startingCapital]);

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
              Crypto Bot uses BTC chain for macro gate · zone bots per coin · one cron refresh
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {SIM_COCKPIT_BOTS.map((b) => (
          <HeatmapBotColumn
            key={b.id}
            bot={b}
            docRef={docRefs[b.id] ?? null}
            macroLine={b.id === "crypto" ? cryptoMacroLine : undefined}
            capital={botMetrics[b.id]?.capital ?? startingCapital}
            openCount={botMetrics[b.id]?.openCount ?? 0}
            cs={cs}
            onRegisterRefetch={registerRefetch(b.id)}
          />
        ))}
      </div>
    </section>
  );
}
