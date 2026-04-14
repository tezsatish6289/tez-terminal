"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Zap, TrendingUp, TrendingDown, PowerOff } from "lucide-react";
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

interface HeatmapZones {
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null;
  bearZoneHigh:  number | null;
  bearZoneLow:   number | null;
  bearExitBelow: number | null;
}

interface AutoStatus {
  btcPrice:      number | null;
  simEnabled:    boolean;
  directionBias: "BULL" | "BEAR" | "BOTH";
  reason:        string;
  updatedAt:     string;
}

const EMPTY_ZONES: HeatmapZones = {
  bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
  bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
};

function PriceInput({
  label, description, value, onChange,
}: {
  label: string;
  description: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState(value !== null ? String(value) : "");

  useEffect(() => {
    setRaw(value !== null ? String(value) : "");
  }, [value]);

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-foreground/80">{label}</label>
      <input
        type="number"
        value={raw}
        placeholder="—"
        onChange={(e) => {
          setRaw(e.target.value);
          const n = parseFloat(e.target.value);
          onChange(isNaN(n) || n <= 0 ? null : n);
        }}
        className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/40 focus:bg-white/[0.05] transition-all"
      />
      <p className="text-[9px] text-muted-foreground/40">{description}</p>
    </div>
  );
}

export function HeatmapAutoSwitch() {
  const firestore = useFirestore();
  const [zones, setZones] = useState<HeatmapZones>(EMPTY_ZONES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Live auto-switch status (written by cron every minute)
  const statusRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "heatmap_auto_status");
  }, [firestore]);
  const { data: statusData } = useDoc(statusRef);
  const status = statusData as AutoStatus | null;

  useEffect(() => {
    fetch("/api/settings/heatmap-zones")
      .then((r) => r.json())
      .then((data) => { setZones(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = useCallback((key: keyof HeatmapZones, val: number | null) => {
    setZones((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/heatmap-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zones),
      });
      setDirty(false);
    } catch (err) {
      console.error("Failed to save heatmap zones:", err);
    } finally {
      setSaving(false);
    }
  }, [zones]);

  const isActive   = status?.simEnabled ?? false;
  const isBull     = isActive && status?.directionBias === "BULL";
  const isBear     = isActive && status?.directionBias === "BEAR";

  const pillLabel  = isBull ? "BULL" : isBear ? "BEAR" : "OFF";
  const pillColor  = isBull
    ? "bg-positive/15 text-positive border-positive/20"
    : isBear
      ? "bg-negative/15 text-negative border-negative/20"
      : "bg-white/[0.04] text-muted-foreground/50 border-white/[0.06]";

  const PillIcon = isBull ? TrendingUp : isBear ? TrendingDown : PowerOff;

  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* Compact trigger — sits alongside SimulatorParamsDialog in the top bar */}
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-all">
          <Zap className="w-3.5 h-3.5 text-accent/70" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
            Heatmap
          </span>
          {/* Live status pill */}
          <span className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-widest",
            pillColor,
          )}>
            <PillIcon className="w-2.5 h-2.5" />
            {pillLabel}
          </span>
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[420px] sm:w-[460px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent/70" />
              <SheetTitle className="text-[13px] font-black uppercase tracking-widest">
                Heatmap Auto-Switch
              </SheetTitle>
            </div>
            <span className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest",
              pillColor,
            )}>
              <PillIcon className="w-3 h-3" />
              {pillLabel}
            </span>
          </div>
          <SheetDescription className="text-[11px] text-muted-foreground/50 mt-1">
            Simulator turns ON/OFF automatically based on where BTC trades relative to these zones.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Live status line */}
          {status?.reason && (
            <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] font-mono text-muted-foreground/60">
                BTC{" "}
                <span className="text-foreground/80 font-bold">
                  ${status.btcPrice?.toLocaleString() ?? "—"}
                </span>
                {" · "}
                {status.reason}
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-4 h-4 animate-spin text-accent/40" />
            </div>
          ) : (
            <>
              {/* Bull zone */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.05]">
                  <TrendingUp className="w-3.5 h-3.5 text-positive/70" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-positive/80">Bull</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <PriceInput
                    label="Zone — Low"
                    description="BTC must be above this"
                    value={zones.bullZoneLow}
                    onChange={(v) => handleChange("bullZoneLow", v)}
                  />
                  <PriceInput
                    label="Zone — High"
                    description="BTC must be below this"
                    value={zones.bullZoneHigh}
                    onChange={(v) => handleChange("bullZoneHigh", v)}
                  />
                  <PriceInput
                    label="Exit Bull Above"
                    description="Zone cleared — stop bull"
                    value={zones.bullExitAbove}
                    onChange={(v) => handleChange("bullExitAbove", v)}
                  />
                </div>
              </div>

              {/* Bear zone */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.05]">
                  <TrendingDown className="w-3.5 h-3.5 text-negative/70" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-negative/80">Bear</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <PriceInput
                    label="Zone — Low"
                    description="BTC must be above this"
                    value={zones.bearZoneLow}
                    onChange={(v) => handleChange("bearZoneLow", v)}
                  />
                  <PriceInput
                    label="Zone — High"
                    description="BTC must be below this"
                    value={zones.bearZoneHigh}
                    onChange={(v) => handleChange("bearZoneHigh", v)}
                  />
                  <PriceInput
                    label="Exit Bear Below"
                    description="Zone cleared — stop bear"
                    value={zones.bearExitBelow}
                    onChange={(v) => handleChange("bearExitBelow", v)}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              dirty
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "bg-white/[0.03] text-muted-foreground/30 cursor-not-allowed border border-white/[0.06]",
            )}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save Zones
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
