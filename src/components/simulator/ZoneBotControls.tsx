"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, Save } from "lucide-react";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";
import type { ZoneBotSettings } from "@/lib/zone-bot-config";
import { zoneBotStatus, type CockpitBotStatus } from "@/lib/cockpit-bot-status";
import { BotCardToolbarTrigger } from "@/components/simulator/BotCardToolbarTrigger";
import type { ZoneBotState } from "@/lib/zone-bot-state";

type ManualOverride = "AUTO" | "OFF";

const DEFAULTS: ZoneBotSettings = {
  manualOverride: "AUTO",
  zoneHalfWidthUsd: 500,
  zoneConfirmMinutes: 15,
};

/** Per-asset zone bot config (BTC / ETH / SOL) — heatmap-only, no manual strikes. */
export function ZoneBotControls({
  asset,
  label,
  onStatusChange,
}: {
  asset: ZoneBotAsset;
  label: string;
  onStatusChange?: (status: CockpitBotStatus) => void;
}) {
  const firestore = useFirestore();
  const [settings, setSettings] = useState<ZoneBotSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const stateRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", `zone_bot_${asset}_state`);
  }, [firestore, asset]);

  const { data: stateData } = useDoc(stateRef);
  const state = stateData as ZoneBotState | null;

  const apiBase = `/api/settings/zone-bot/${asset}`;

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((data: ZoneBotSettings) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiBase]);

  const status = zoneBotStatus(settings, state);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status.power, status.label, status.detail, onStatusChange]);

  const handleOverride = useCallback(
    async (override: ManualOverride) => {
      setSettings((prev) => ({ ...prev, manualOverride: override }));
      try {
        await fetch(apiBase, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manualOverride: override }),
        });
      } catch (err) {
        console.error(`[ZoneBotControls ${asset}] override save failed:`, err);
      }
    },
    [apiBase, asset],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(apiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setDirty(false);
    } catch (err) {
      console.error(`[ZoneBotControls ${asset}] save failed:`, err);
    } finally {
      setSaving(false);
    }
  }, [apiBase, settings]);

  const isForcedOff = settings.manualOverride === "OFF";
  // Legacy 2-state mapping. This sheet predates the SIM_ONLY mode
  // and the new cockpit no longer mounts it; the unified SimBotConfigSheet
  // is the live entry point. Kept compilable for the historical render path.
  const tradingMode = isForcedOff ? "OFF" : "SIM_LIVE";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <BotCardToolbarTrigger
          tradingMode={tradingMode}
          power={status.power}
          sheetLabel="Config"
          onTradingModeChange={(next) => {
            void handleOverride(next === "OFF" ? "OFF" : "AUTO");
          }}
        />
      </SheetTrigger>

      <SheetContent side="right" className="w-[400px] sm:w-[440px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-white/[0.06]">
          <SheetTitle className="text-[13px] font-black uppercase tracking-widest">
            {label} settings
          </SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground/50">
            Heatmap-only zone bot · zones from Deribit OI cron
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="flex gap-2">
            {(["AUTO", "OFF"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void handleOverride(mode)}
                className={cn(
                  "flex-1 py-2.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all",
                  settings.manualOverride === mode
                    ? mode === "AUTO"
                      ? "bg-accent/15 border-accent/30 text-accent"
                      : "bg-rose-500/10 border-rose-500/25 text-rose-400"
                    : "border-white/[0.08] text-muted-foreground/50 hover:bg-white/[0.04]",
                )}
              >
                {mode === "AUTO" ? "Auto" : "Force off"}
              </button>
            ))}
          </div>

          {state?.reason && (
            <p className="text-[10px] font-mono text-muted-foreground/55 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
              {state.reason}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground/50 leading-relaxed px-1">
            Slot policy: up to <span className="text-foreground/70 font-bold">1 open sim trade</span>{" "}
            per zone bot. Crypto pattern bot uses the remaining slots under global Simulator
            Parameters (1 slot reserved for BTC while BTC Zone is live).
          </p>

          <div className="space-y-3">
            <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.05]">
              <Activity className="w-3.5 h-3.5 text-accent/60" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">
                Zone confirmation
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="font-bold text-foreground/80">Window</span>
              <span className="font-mono font-bold text-accent">
                {settings.zoneConfirmMinutes} min
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={settings.zoneConfirmMinutes}
              onChange={(e) => {
                setSettings((p) => ({
                  ...p,
                  zoneConfirmMinutes: parseInt(e.target.value, 10),
                }));
                setDirty(true);
              }}
              className="w-full accent-accent"
            />
          </div>

          <button
            type="button"
            disabled={!dirty || saving || loading}
            onClick={() => void handleSave()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-black text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save settings
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

