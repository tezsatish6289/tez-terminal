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

type ManualOverride = "AUTO" | "OFF";

interface HeatmapZones {
  bullZoneLow:         number | null;
  bullZoneHigh:        number | null;
  bullExitAbove:       number | null;
  bearZoneHigh:        number | null;
  bearZoneLow:         number | null;
  bearExitBelow:       number | null;
  manualOverride:      ManualOverride;
  momentumLookbackMin: number | null;
  zoneHalfWidthUsd:    number | null;
  maxPainProximityUsd: number | null;
}

interface AutoStatus {
  btcPrice:      number | null;
  simEnabled:    boolean;
  directionBias: "BULL" | "BEAR" | "BOTH";
  reason:        string;
  updatedAt:     string;
}

interface MaxPainEntry {
  expiry:   string;
  maxPain:  number;
  totalOI:  number;
  dayIndex: number;
}

interface SuggestedZones {
  bullStrike:        number | null;
  bearStrike:        number | null;
  bullZoneLow:       number | null;
  bullZoneHigh:      number | null;
  bullExitAbove:     number | null;
  bearZoneLow:       number | null;
  bearZoneHigh:      number | null;
  bearExitBelow:     number | null;
  bullOI:            number | null;
  bearOI:            number | null;
  bullVolume:        number | null;
  bearVolume:        number | null;
  maxPain:           number | null;
  maxPainByExpiry:   MaxPainEntry[] | null;
  signalConflict:    boolean | null;
  bullTpTarget:      number | null;
  bullTpExpiry:      string | null;
  bullTpConfidence:  "HIGH" | "MEDIUM" | "LOW" | null;
  bearTpTarget:      number | null;
  bearTpExpiry:      string | null;
  bearTpConfidence:  "HIGH" | "MEDIUM" | "LOW" | null;
  expiryUsed:        string  | null;
  expiriesUsed:      string[] | null;
  expiryOI:          number | null;
  insufficientGap:   boolean | null;
  btcPrice:          number | null;
  deribitIndexPrice: number | null;
  source:            string;
  computedAt:        string;
}

const EMPTY_ZONES: HeatmapZones = {
  bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
  bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
  manualOverride: "AUTO",
  momentumLookbackMin: 10,
  zoneHalfWidthUsd: null,
  maxPainProximityUsd: null,
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

function MomentumFilter({
  value, onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between pb-1 border-b border-white/[0.05]">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-accent/60" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">Momentum Filter</span>
        </div>
        <button
          onClick={() => onChange(value !== null ? null : 10)}
          className={cn(
            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border transition-all",
            value !== null
              ? "bg-accent/15 text-accent border-accent/20"
              : "bg-white/[0.03] text-muted-foreground/40 border-white/[0.06]",
          )}
        >
          {value !== null ? "On" : "Off"}
        </button>
      </div>
      {value !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-foreground/80">Lookback Window</label>
            <span className="text-[11px] font-mono font-bold text-accent">{value} min</span>
          </div>
          <input
            type="range" min={3} max={30} step={1} value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground/30">
            <span>3 min</span><span>30 min</span>
          </div>
          <p className="text-[9px] text-muted-foreground/40 pt-0.5">
            Simulator only activates when BTC is trending in the right direction over this window.
            &ldquo;WAITING&rdquo; shows in the status line when price is in zone but momentum isn&apos;t confirmed yet.
          </p>
        </div>
      )}
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

  const statusRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "heatmap_auto_status");
  }, [firestore]);
  const { data: statusData } = useDoc(statusRef);
  const status = statusData as AutoStatus | null;

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

  const override    = zones.manualOverride;
  const isForcedOff = override === "OFF";
  const effectiveOn = isForcedOff ? false : (status?.simEnabled ?? false);
  const effectiveBull = !isForcedOff && status?.simEnabled && status?.directionBias === "BULL";

  const triggerColor = isForcedOff
    ? "bg-white/[0.04] text-muted-foreground/40 border-white/[0.06]"
    : "bg-accent/15 text-accent border-accent/20";

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
            triggerColor,
          )}>
            {isForcedOff ? <PowerOff className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
            {isForcedOff ? "Off" : "Auto"}
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
              triggerColor,
            )}>
              {isForcedOff ? <PowerOff className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
              {isForcedOff ? "Force Off" : "Auto"}
            </span>
          </div>
          <SheetDescription className="text-[11px] text-muted-foreground/50 mt-1">
            Simulator turns ON/OFF automatically based on where BTC trades relative to Deribit OI zones.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Status line */}
          <div className={cn(
            "px-3 py-2.5 rounded-lg border text-[10px] font-mono",
            effectiveOn
              ? effectiveBull ? "bg-positive/5 border-positive/20 text-positive/80" : "bg-negative/5 border-negative/20 text-negative/80"
              : "bg-white/[0.03] border-white/[0.05] text-muted-foreground/60",
          )}>
            {isForcedOff ? (
              <span>
                BTC <span className="font-bold">${status?.btcPrice?.toLocaleString() ?? "—"}</span>
                {" · "}
                <span className="font-bold">FORCED OFF</span>
                {" — no new trades"}
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

          {/* ── AUTO / FORCE OFF toggle ── */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <button
              onClick={() => handleOverride("AUTO")}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                !isForcedOff
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.04]",
              )}
            >
              Auto (Deribit)
            </button>
            <button
              onClick={() => handleOverride("OFF")}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                isForcedOff
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.04]",
              )}
            >
              Force Off
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-4 h-4 animate-spin text-accent/40" />
            </div>
          ) : isForcedOff ? (
            /* ── FORCE OFF ── */
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 space-y-2 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                <PowerOff className="w-3 h-3" />
                Simulator off
              </div>
              <p className="text-[11px] text-muted-foreground/40">
                No new trades will open. Existing trades continue to run.
              </p>
              <p className="text-[9px] text-amber-400/50">
                Switch back to Auto (Deribit) to resume zone-based switching.
              </p>
            </div>
          ) : (
            /* ── AUTO: Deribit smart zones (read-only) ── */
            <div className="space-y-3">
              {suggested ? (
                <>
                  {/* Signal conflict warning */}
                  {suggested.signalConflict && (
                    <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2.5">
                      <p className="text-[10px] font-bold text-amber-400/90">Signal Conflict — expiry disagreement</p>
                      <p className="text-[9px] text-muted-foreground/55 mt-0.5">
                        Day 0 and Day 1 max pain are on opposite sides of current price. MMs have competing incentives. Trade with extra caution.
                      </p>
                    </div>
                  )}

                  {/* Insufficient gap warning */}
                  {suggested.insufficientGap && (
                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
                      <p className="text-[10px] font-bold text-amber-400/80">Zones too close — no trades</p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                        Put and call clusters are less than $2,500 apart. Simulator stays OFF until zones widen.
                      </p>
                    </div>
                  )}

                  {/* 3-day max pain table */}
                  {suggested.maxPainByExpiry && suggested.maxPainByExpiry.length > 0 && (
                    <div className="rounded-lg border border-accent/15 bg-accent/[0.03] overflow-hidden">
                      <div className="px-3 py-2 border-b border-accent/10">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-accent/60">Max Pain — MM destination</p>
                      </div>
                      <div className="divide-y divide-white/[0.04]">
                        {suggested.maxPainByExpiry.map((entry) => {
                          const label  = entry.dayIndex === 0 ? "Today" : entry.dayIndex === 1 ? "Tomorrow" : "Day +2";
                          const isDay0 = entry.dayIndex === 0;
                          return (
                            <div key={entry.expiry} className="flex items-center justify-between px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isDay0 ? "text-accent/80" : "text-muted-foreground/50"}`}>
                                  {label}
                                </span>
                                <span className="text-[9px] text-muted-foreground/35">{entry.expiry}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-[12px] font-mono font-bold ${isDay0 ? "text-accent" : "text-muted-foreground/60"}`}>
                                  ${entry.maxPain.toLocaleString()}
                                </span>
                                <span className="text-[9px] font-mono text-muted-foreground/30">
                                  {Math.round(entry.totalOI)}c
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bull / Bear zone cards */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-positive/20 bg-positive/[0.04] px-3 py-2.5 space-y-1">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-positive/60" />
                        <p className="text-[9px] font-bold uppercase tracking-widest text-positive/70">Bull entry</p>
                      </div>
                      {suggested.bullStrike != null ? (
                        <>
                          <p className="text-[12px] font-mono font-bold text-positive">
                            ${suggested.bullZoneLow?.toLocaleString()}–${suggested.bullZoneHigh?.toLocaleString()}
                          </p>
                          <p className="text-[9px] font-mono text-muted-foreground/45">
                            Center ${suggested.bullStrike.toLocaleString()}
                            {suggested.deribitIndexPrice != null && <> · index ${Math.round(suggested.deribitIndexPrice).toLocaleString()}</>}
                          </p>
                          {(suggested.bullOI ?? suggested.bullVolume) != null && (
                            <p className="text-[9px] text-muted-foreground/40">
                              {Math.round(suggested.bullOI ?? suggested.bullVolume ?? 0)}c put OI (wtd)
                            </p>
                          )}
                          {suggested.bullTpTarget != null && (
                            <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                              <span className="text-[9px] text-muted-foreground/40">TP →</span>
                              <span className="font-mono text-[10px] font-bold text-positive/80">${suggested.bullTpTarget.toLocaleString()}</span>
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                                suggested.bullTpConfidence === "HIGH"   ? "bg-positive/20 text-positive/80" :
                                suggested.bullTpConfidence === "MEDIUM" ? "bg-amber-400/20 text-amber-400/80" :
                                                                          "bg-white/10 text-muted-foreground/50"
                              }`}>{suggested.bullTpConfidence}</span>
                              {suggested.bullTpExpiry && (
                                <span className="text-[8px] text-muted-foreground/30">{suggested.bullTpExpiry}</span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/40 pt-1">
                          {suggested.bullOI ? "Put support found — no upside max pain target. No bull trades." : "No put cluster found below price."}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-negative/20 bg-negative/[0.04] px-3 py-2.5 space-y-1">
                      <div className="flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-negative/60" />
                        <p className="text-[9px] font-bold uppercase tracking-widest text-negative/70">Bear entry</p>
                      </div>
                      {suggested.bearStrike != null ? (
                        <>
                          <p className="text-[12px] font-mono font-bold text-negative">
                            ${suggested.bearZoneLow?.toLocaleString()}–${suggested.bearZoneHigh?.toLocaleString()}
                          </p>
                          <p className="text-[9px] font-mono text-muted-foreground/45">
                            Center ${suggested.bearStrike.toLocaleString()}
                            {suggested.deribitIndexPrice != null && <> · index ${Math.round(suggested.deribitIndexPrice).toLocaleString()}</>}
                          </p>
                          {(suggested.bearOI ?? suggested.bearVolume) != null && (
                            <p className="text-[9px] text-muted-foreground/40">
                              {Math.round(suggested.bearOI ?? suggested.bearVolume ?? 0)}c call OI (wtd)
                            </p>
                          )}
                          {suggested.bearTpTarget != null && (
                            <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                              <span className="text-[9px] text-muted-foreground/40">TP →</span>
                              <span className="font-mono text-[10px] font-bold text-negative/80">${suggested.bearTpTarget.toLocaleString()}</span>
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                                suggested.bearTpConfidence === "HIGH"   ? "bg-positive/20 text-positive/80" :
                                suggested.bearTpConfidence === "MEDIUM" ? "bg-amber-400/20 text-amber-400/80" :
                                                                          "bg-white/10 text-muted-foreground/50"
                              }`}>{suggested.bearTpConfidence}</span>
                              {suggested.bearTpExpiry && (
                                <span className="text-[8px] text-muted-foreground/30">{suggested.bearTpExpiry}</span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/40 pt-1">
                          {suggested.bearOI ? "Call resistance found — no downside max pain target. No bear trades." : "No call cluster found above price."}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground/30 text-center">
                    Zones auto-managed · refreshed every 15 min · last {new Date(suggested.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center">
                  <p className="text-[10px] text-muted-foreground/40">No Deribit zone data yet</p>
                  <p className="text-[9px] text-muted-foreground/25 mt-1">Hit Refresh Zones below to compute from Deribit OI</p>
                </div>
              )}

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Deribit zone half-width
                </p>
                <PriceInput
                  label="± USD around strike"
                  description="Full entry band = 2× this value. Leave empty for default (500)."
                  value={zones.zoneHalfWidthUsd}
                  onChange={(v) => handleChange("zoneHalfWidthUsd", v)}
                />
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Max Pain exit proximity
                </p>
                <PriceInput
                  label="± USD from TP target (max pain)"
                  description="One-sided zone only — closes open trades when BTC reaches the TP shown above (±this buffer). Default 200."
                  value={zones.maxPainProximityUsd}
                  onChange={(v) => handleChange("maxPainProximityUsd", v)}
                />
              </div>

              <MomentumFilter value={zones.momentumLookbackMin} onChange={(v) => handleChange("momentumLookbackMin", v)} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshSuggestions}
                disabled={refreshing}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05] transition-all disabled:opacity-40 shrink-0"
              >
                <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
                {refreshing ? "Fetching…" : "Refresh Zones"}
              </button>
              {suggested?.computedAt && (
                <span className="text-[9px] text-muted-foreground/30 truncate">
                  deribit · {new Date(suggested.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {suggested?.expiryUsed && (
              <p className="text-[9px] text-muted-foreground/35 pl-0.5">
                Max Pain <span className="font-mono font-bold text-accent/60">${suggested.maxPain?.toLocaleString() ?? "—"}</span>
                {` · ${suggested.expiryUsed}`}
              </p>
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
            Save
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
