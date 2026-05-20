"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { doc, type DocumentReference } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { SIM_PANEL } from "@/components/simulator/simulator-surfaces";
import { HEATMAP_UI_ASSETS } from "@/lib/zone-bot-config";
import { HeatmapAssetCard } from "@/components/simulator/HeatmapAssetCard";
import type { SuggestedZonesSnapshot } from "@/components/simulator/heatmap-types";
import { HeatmapAutoSwitch } from "@/components/simulator/HeatmapAutoSwitch";

interface BtcMacroStatus {
  btcPrice: number | null;
  simEnabled: boolean;
  directionBias: string;
  reason: string;
}

function suggestedDocPath(assetId: string): string {
  if (assetId === "btc") return "suggested_zones";
  return `suggested_zones_${assetId}`;
}

function HeatmapAssetColumn({
  assetId,
  label,
  deribit,
  docRef,
  macroLine,
  onRegisterRefetch,
}: {
  assetId: string;
  label: string;
  deribit: boolean;
  docRef: DocumentReference | null;
  macroLine?: string | null;
  onRegisterRefetch: (fn: () => void) => void;
}) {
  const { data, refetch } = useDoc(docRef);
  const suggested = data as SuggestedZonesSnapshot | null;

  useEffect(() => {
    onRegisterRefetch(refetch);
  }, [refetch, onRegisterRefetch]);

  return (
    <HeatmapAssetCard
      asset={assetId as "btc" | "eth" | "sol" | "xrp"}
      label={label}
      suggested={suggested}
      deribit={deribit}
      macroLine={macroLine}
      settingsSlot={
        assetId === "btc" ? (
          <div className="shrink-0">
            <HeatmapAutoSwitch />
          </div>
        ) : undefined
      }
    />
  );
}

/** Four Deribit heatmaps (BTC, ETH, SOL) + XRP placeholder on the simulation page. */
export function HeatmapGrid() {
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
      HEATMAP_UI_ASSETS.map((a) => [
        a.id,
        doc(firestore, "config", suggestedDocPath(a.id)),
      ]),
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

  const btcMacroLine = useMemo(() => {
    if (!macro) return null;
    return macro.simEnabled
      ? `Crypto bot ON · ${macro.directionBias}`
      : "Crypto bot OFF";
  }, [macro]);

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
              Bull / bear OI zones per asset · refreshed every 15 min
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {HEATMAP_UI_ASSETS.map((a) => (
          <HeatmapAssetColumn
            key={a.id}
            assetId={a.id}
            label={a.label}
            deribit={a.deribit}
            docRef={docRefs[a.id] ?? null}
            macroLine={a.id === "btc" ? btcMacroLine : undefined}
            onRegisterRefetch={registerRefetch(a.id)}
          />
        ))}
      </div>
    </section>
  );
}
