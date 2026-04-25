"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Zap, TrendingUp, TrendingDown, PowerOff, Activity, RefreshCw } from "lucide-react";
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

type ManualOverride = "AUTO" | "BULL" | "BOTH" | "BEAR" | "OFF";

interface HeatmapZones {
  bullZoneLow:         number | null;
  bullZoneHigh:        number | null;
  bullExitAbove:       number | null;
  bearZoneHigh:        number | null;
  bearZoneLow:         number | null;
  bearExitBelow:       number | null;
  manualOverride:      ManualOverride;
  momentumLookbackMin: number | null; // null = disabled
}

interface AutoStatus {
  btcPrice:      number | null;
  simEnabled:    boolean;
  directionBias: "BULL" | "BEAR" | "BOTH";
  reason:        string;
  updatedAt:     string;
}

interface SuggestedZones {
  bullZoneLow:   number | null;
  bullZoneHigh:  number | null;
  bullExitAbove: number | null;
  bearZoneLow:   number | null;
  bearZoneHigh:  number | null;
  bearExitBelow: number | null;
  bullVolume:    number | null;
  bearVolume:    number | null;
  btcPrice:      number | null;
  source:        "bybit" | "binance";
  computedAt:    string;
}

const EMPTY_ZONES: HeatmapZones = {
  bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
  bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
  manualOverride: "AUTO",
  momentumLookbackMin: 10,
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
  const [refreshing, setRefreshing] = useState(false);

  // Live auto-switch status (written by cron every minute)
  const statusRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "heatmap_auto_status");
  }, [firestore]);
  const { data: statusData } = useDoc(statusRef);
  const status = statusData as AutoStatus | null;

  // Suggested zones from volume profile analysis (written by suggest-zones cron)
  const suggestedRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "suggested_zones");
  }, [firestore]);
  const { data: suggestedData } = useDoc(suggestedRef);
  const suggested = suggestedData as SuggestedZones | null;

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

  // Override saves immediately (no dirty/save button needed — instant feedback)
  const handleOverride = useCallback(async (override: ManualOverride) => {
    setZones((prev) => ({ ...prev, manualOverride: override }));
    try {
      await fetch("/api/settings/heatmap-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualOverride: override }),
      });
    } catch (err) {
      console.error("Failed to save override:", err);
    }
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

  const handleRefreshSuggestions = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/cron/suggest-zones", { method: "POST" });
    } catch (err) {
      console.error("Failed to refresh suggestions:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);


  // When override is active, derive pill from zones state immediately (no cron delay).
  // When on AUTO, derive from the cron-written status doc.
  const override = zones.manualOverride;
  const isOverride = override !== "AUTO";

  // Trigger pill always mirrors the override label directly
  const OVERRIDE_META: Record<ManualOverride, { label: string; color: string; icon: React.ReactNode }> = {
    AUTO:  { label: "Auto",      color: "bg-white/[0.06] text-muted-foreground/70 border-white/[0.08]", icon: <Zap className="w-2.5 h-2.5" /> },
    BULL:  { label: "Bull",      color: "bg-positive/15 text-positive border-positive/20",              icon: <TrendingUp className="w-2.5 h-2.5" /> },
    BOTH:  { label: "Both",      color: "bg-accent/15 text-accent border-accent/20",                    icon: <Activity className="w-2.5 h-2.5" /> },
    BEAR:  { label: "Bear",      color: "bg-negative/15 text-negative border-negative/20",              icon: <TrendingDown className="w-2.5 h-2.5" /> },
    OFF:   { label: "Force Off", color: "bg-white/[0.04] text-muted-foreground/40 border-white/[0.06]", icon: <PowerOff className="w-2.5 h-2.5" /> },
  };

  const pillMeta  = OVERRIDE_META[override];
  const pillLabel = pillMeta.label;
  const pillColor = pillMeta.color;

  // Still needed for status line colouring inside the sheet
  const effectiveOn   = isOverride ? override !== "OFF" : (status?.simEnabled ?? false);
  const effectiveBull = isOverride ? (override === "BULL" || override === "BOTH") : (status?.simEnabled && status?.directionBias === "BULL");
  const effectiveBear = isOverride ? (override === "BEAR" || override === "BOTH") : (status?.simEnabled && status?.directionBias === "BEAR");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-all">
          <Zap className="w-3.5 h-3.5 text-accent/70" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
            Heatmap
          </span>
          <span className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-widest",
            pillColor,
          )}>
            {pillMeta.icon}
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
              {pillMeta.icon}
              {pillLabel}
            </span>
          </div>
          <SheetDescription className="text-[11px] text-muted-foreground/50 mt-1">
            Simulator turns ON/OFF automatically based on where BTC trades relative to these zones.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Status line — shows override state immediately, or cron result in AUTO */}
          <div className={cn(
            "px-3 py-2.5 rounded-lg border text-[10px] font-mono",
            effectiveOn
              ? effectiveBull ? "bg-positive/5 border-positive/20 text-positive/80" : "bg-negative/5 border-negative/20 text-negative/80"
              : "bg-white/[0.03] border-white/[0.05] text-muted-foreground/60",
          )}>
            {isOverride ? (
              <span>
                BTC <span className="font-bold">${status?.btcPrice?.toLocaleString() ?? "—"}</span>
                {" · "}
                <span className="font-bold">{override === "BULL" ? "BULL ACTIVE" : override === "BEAR" ? "BEAR ACTIVE" : override === "BOTH" ? "BULL + BEAR ACTIVE" : "FORCED OFF"}</span>
                {" — manual override (takes effect next cron cycle)"}
              </span>
            ) : status?.reason ? (
              <span>
                BTC <span className="font-bold">${status.btcPrice?.toLocaleString() ?? "—"}</span>
                {" · "}
                {status.reason}
              </span>
            ) : (
              <span className="text-muted-foreground/40">Waiting for first cron cycle…</span>
            )}
          </div>

          {/* Manual override — instant save, no dirty flag */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Manual Override
            </p>
            <div className="flex items-center gap-1.5 p-1 rounded-xl border border-white/[0.08] bg-white/[0.02]">
              {([
                { key: "AUTO" as ManualOverride, label: "Auto",      color: "bg-accent text-accent-foreground" },
                { key: "BULL" as ManualOverride, label: "Bull",      color: "bg-positive text-black" },
                { key: "BOTH" as ManualOverride, label: "Both",      color: "bg-accent text-accent-foreground" },
                { key: "BEAR" as ManualOverride, label: "Bear",      color: "bg-negative text-white" },
                { key: "OFF"  as ManualOverride, label: "Force Off", color: "bg-white/10 text-foreground" },
              ]).map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => handleOverride(key)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                    zones.manualOverride === key
                      ? color
                      : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.04]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {zones.manualOverride !== "AUTO" && (
              <p className="text-[9px] text-amber-400/70">
                Zone logic is bypassed — switch back to Auto to resume normal behaviour.
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-4 h-4 animate-spin text-accent/40" />
            </div>
          ) : (
            <>
              {/* Bull zone */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-white/[0.05]">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-positive/70" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-positive/80">Bull</span>
                  </div>
                  {/* Inline suggestion chip */}
                  {suggested?.bullZoneLow && suggested?.bullZoneHigh && (
                    <button
                      onClick={() => {
                        setZones((p) => ({
                          ...p,
                          bullZoneLow:   suggested.bullZoneLow,
                          bullZoneHigh:  suggested.bullZoneHigh,
                          bullExitAbove: suggested.bullExitAbove,
                        }));
                        setDirty(true);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-positive/20 bg-positive/[0.06] text-[9px] font-mono font-bold text-positive/70 hover:text-positive hover:bg-positive/10 transition-all"
                      title="Apply volume-profile suggestion to bull zone"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      ${suggested.bullZoneLow.toLocaleString()}–${suggested.bullZoneHigh.toLocaleString()}
                    </button>
                  )}
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
                <div className="flex items-center justify-between pb-1 border-b border-white/[0.05]">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-negative/70" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-negative/80">Bear</span>
                  </div>
                  {/* Inline suggestion chip */}
                  {suggested?.bearZoneLow && suggested?.bearZoneHigh && (
                    <button
                      onClick={() => {
                        setZones((p) => ({
                          ...p,
                          bearZoneLow:   suggested.bearZoneLow,
                          bearZoneHigh:  suggested.bearZoneHigh,
                          bearExitBelow: suggested.bearExitBelow,
                        }));
                        setDirty(true);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-negative/20 bg-negative/[0.06] text-[9px] font-mono font-bold text-negative/70 hover:text-negative hover:bg-negative/10 transition-all"
                      title="Apply volume-profile suggestion to bear zone"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      ${suggested.bearZoneLow.toLocaleString()}–${suggested.bearZoneHigh.toLocaleString()}
                    </button>
                  )}
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

              {/* Momentum confirmation */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between pb-1 border-b border-white/[0.05]">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-accent/60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">Momentum Filter</span>
                  </div>
                  <button
                    onClick={() => { handleChange("momentumLookbackMin", zones.momentumLookbackMin !== null ? null : 10); }}
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border transition-all",
                      zones.momentumLookbackMin !== null
                        ? "bg-accent/15 text-accent border-accent/20"
                        : "bg-white/[0.03] text-muted-foreground/40 border-white/[0.06]",
                    )}
                  >
                    {zones.momentumLookbackMin !== null ? "On" : "Off"}
                  </button>
                </div>
                {zones.momentumLookbackMin !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-foreground/80">Lookback Window</label>
                      <span className="text-[11px] font-mono font-bold text-accent">{zones.momentumLookbackMin} min</span>
                    </div>
                    <input
                      type="range"
                      min={3} max={30} step={1}
                      value={zones.momentumLookbackMin}
                      onChange={(e) => handleChange("momentumLookbackMin", parseInt(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground/30">
                      <span>3 min</span><span>30 min</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 pt-0.5">
                      Simulator only activates when BTC is trending in the right direction over this window. "WAITING" shows in the status line when price is in zone but momentum isn't confirmed yet.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
          {/* Volume profile refresh — compact, stays out of the way */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleRefreshSuggestions}
              disabled={refreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05] transition-all disabled:opacity-40 shrink-0"
            >
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
              {refreshing ? "Analysing…" : "Refresh Zones"}
            </button>
            {suggested?.computedAt && (
              <span className="text-[9px] text-muted-foreground/30 truncate">
                vol profile · {new Date(suggested.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {suggested.source}
              </span>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shrink-0",
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
