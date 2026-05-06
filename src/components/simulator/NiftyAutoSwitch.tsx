"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Zap, TrendingUp, TrendingDown, PowerOff, Activity, RefreshCw, BarChart2 } from "lucide-react";
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
type ZoneTab = "smart" | "custom";

interface NiftyZones {
  bullZoneLow:         number | null;
  bullZoneHigh:        number | null;
  bullExitAbove:       number | null;
  bearZoneHigh:        number | null;
  bearZoneLow:         number | null;
  bearExitBelow:       number | null;
  manualOverride:      ManualOverride;
  momentumLookbackMin: number | null;
}

interface AutoStatus {
  niftyPrice:    number | null;
  simEnabled:    boolean;
  directionBias: "BULL" | "BEAR" | "BOTH";
  reason:        string;
  updatedAt:     string;
}

interface SuggestedNiftyZones {
  bullStrike:          number | null;
  bearStrike:          number | null;
  bullZoneLow:         number | null;
  bullZoneHigh:        number | null;
  bullExitAbove:       number | null;
  bearZoneLow:         number | null;
  bearZoneHigh:        number | null;
  bearExitBelow:       number | null;
  bullOI:              number | null;
  bearOI:              number | null;
  maxPain:             number | null;
  expiryUsed:          string | null;
  expiryOI:            number | null;
  insufficientGap:     boolean | null;
  niftyPrice:          number | null;
  source:              string;
  computedAt:          string;
  mergedFromPrevious?: boolean;
  nseFetchError?:      string | null;
  syntheticSpotFallback?: boolean;
  zoneNote?:           string | null;
}

const EMPTY_ZONES: NiftyZones = {
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

function MomentumFilter({
  value, onChange, label = "Nifty",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label?: string;
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
            <span className="text-[11px] font-bold text-foreground/80">Lookback Window</span>
            <span className="text-[11px] font-mono font-bold text-accent">{value} min</span>
          </div>
          <input
            type="range"
            min={3} max={30} step={1}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground/30">
            <span>3 min</span><span>30 min</span>
          </div>
          <p className="text-[9px] text-muted-foreground/40 pt-0.5">
            Simulator only activates when {label} is trending in the right direction over this window.
            &ldquo;WAITING&rdquo; shows in the status line when price is in zone but momentum isn&apos;t confirmed yet.
          </p>
        </div>
      )}
    </div>
  );
}

export function NiftyAutoSwitch() {
  const firestore = useFirestore();
  const [zones, setZones] = useState<NiftyZones>(EMPTY_ZONES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [zoneTab, setZoneTab] = useState<ZoneTab>("smart");

  const statusRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "nifty_auto_status");
  }, [firestore]);
  const { data: statusData } = useDoc(statusRef);
  const status = statusData as AutoStatus | null;

  const suggestedRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "suggested_nifty_zones");
  }, [firestore]);
  const { data: suggestedData } = useDoc(suggestedRef);
  const suggested = suggestedData as SuggestedNiftyZones | null;

  useEffect(() => {
    fetch("/api/settings/nifty-zones")
      .then((r) => r.json())
      .then((data) => { setZones(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = useCallback((key: keyof NiftyZones, val: number | null) => {
    setZones((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  }, []);

  const handleOverride = useCallback(async (override: ManualOverride) => {
    setZones((prev) => ({ ...prev, manualOverride: override }));
    try {
      await fetch("/api/settings/nifty-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualOverride: override }),
      });
    } catch (err) {
      console.error("Failed to save Nifty override:", err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/nifty-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zones),
      });
      setDirty(false);
    } catch (err) {
      console.error("Failed to save Nifty zones:", err);
    } finally {
      setSaving(false);
    }
  }, [zones]);

  const handleRefreshSuggestions = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/cron/suggest-nifty-zones", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRefreshError((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const override = zones.manualOverride;
  const isOverride = override !== "AUTO";

  const OVERRIDE_META: Record<ManualOverride, { label: string; color: string; icon: React.ReactNode }> = {
    AUTO:  { label: "Auto",      color: "bg-white/[0.06] text-muted-foreground/70 border-white/[0.08]", icon: <Zap className="w-2.5 h-2.5" /> },
    BULL:  { label: "Bull",      color: "bg-positive/15 text-positive border-positive/20",              icon: <TrendingUp className="w-2.5 h-2.5" /> },
    BOTH:  { label: "Both",      color: "bg-accent/15 text-accent border-accent/20",                    icon: <Activity className="w-2.5 h-2.5" /> },
    BEAR:  { label: "Bear",      color: "bg-negative/15 text-negative border-negative/20",              icon: <TrendingDown className="w-2.5 h-2.5" /> },
    OFF:   { label: "Force Off", color: "bg-white/[0.04] text-muted-foreground/40 border-white/[0.06]", icon: <PowerOff className="w-2.5 h-2.5" /> },
  };

  const pillMeta   = OVERRIDE_META[override];
  const effectiveOn   = isOverride ? override !== "OFF" : (status?.simEnabled ?? false);
  const effectiveBull = isOverride ? (override === "BULL" || override === "BOTH") : (status?.simEnabled && status?.directionBias === "BULL");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-all">
          <BarChart2 className="w-3.5 h-3.5 text-accent/70" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
            Nifty
          </span>
          <span className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-widest",
            pillMeta.color,
          )}>
            {pillMeta.icon}
            {pillMeta.label}
          </span>
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[420px] sm:w-[460px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-accent/70" />
              <SheetTitle className="text-[13px] font-black uppercase tracking-widest">
                Nifty Auto-Switch
              </SheetTitle>
            </div>
            <span className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest",
              pillMeta.color,
            )}>
              {pillMeta.icon}
              {pillMeta.label}
            </span>
          </div>
          <SheetDescription className="text-[11px] text-muted-foreground/50 mt-1">
            Indian stocks simulator turns ON/OFF automatically based on where Nifty trades relative to these zones.
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
            {isOverride ? (
              <span>
                Nifty <span className="font-bold">₹{status?.niftyPrice?.toLocaleString() ?? "—"}</span>
                {" · "}
                <span className="font-bold">
                  {override === "BULL" ? "BULL ACTIVE" : override === "BEAR" ? "BEAR ACTIVE" : override === "BOTH" ? "BULL + BEAR ACTIVE" : "FORCED OFF"}
                </span>
                {" — manual override (takes effect next cron cycle)"}
              </span>
            ) : status?.reason ? (
              <span>
                Nifty <span className="font-bold">₹{status.niftyPrice?.toLocaleString() ?? "—"}</span>
                {" · "}
                {status.reason}
              </span>
            ) : (
              <span className="text-muted-foreground/40">Waiting for first cron cycle…</span>
            )}
          </div>

          {/* Mode buttons */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Mode
            </p>
            <div className="flex items-center gap-1 p-1 rounded-xl border border-white/[0.08] bg-white/[0.02]">
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
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-4 h-4 animate-spin text-accent/40" />
            </div>
          ) : isOverride ? (
            /* ── Non-AUTO override: clean status ── */
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 space-y-3 text-center">
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-widest",
                pillMeta.color,
              )}>
                {pillMeta.icon}
                {override === "BULL" ? "Bull trades only" :
                 override === "BEAR" ? "Bear trades only" :
                 override === "BOTH" ? "Both directions" :
                 "Simulator off"}
              </div>
              <p className="text-[11px] text-muted-foreground/50">
                Zone logic is bypassed. The simulator will{" "}
                {override === "OFF"
                  ? "not open any new trades"
                  : `only open ${override === "BOTH" ? "bull and bear" : override.toLowerCase()} trades`}{" "}
                regardless of Nifty price.
              </p>
              <p className="text-[9px] text-amber-400/60 mt-1">
                Switch to <span className="font-bold">Auto</span> to re-enable zone-based switching.
              </p>
            </div>
          ) : (
            /* ── AUTO mode: Smart (NSE) / Custom Zones tabs ── */
            <div className="space-y-4">

              {/* Tab switcher */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <button
                  onClick={() => setZoneTab("smart")}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                    zoneTab === "smart"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.04]",
                  )}
                >
                  Smart (NSE OI)
                </button>
                <button
                  onClick={() => setZoneTab("custom")}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                    zoneTab === "custom"
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.04]",
                  )}
                >
                  Manual Zones
                </button>
              </div>

              {zoneTab === "smart" ? (
                /* ── Smart tab: NSE OI summary (read-only) ── */
                <div className="space-y-3">
                  {suggested?.insufficientGap && (
                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
                      <p className="text-[10px] font-bold text-amber-400/80">Zones too close — no trades</p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                        Put and call clusters are less than 600 pts apart. Simulator stays OFF until zones widen.
                      </p>
                    </div>
                  )}
                  {suggested?.zoneNote && (
                    <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2.5 space-y-1">
                      <p className="text-[10px] font-bold text-cyan-400/85">Spot-only zone bands</p>
                      <p className="text-[9px] text-muted-foreground/55 leading-snug">{suggested.zoneNote}</p>
                    </div>
                  )}
                  {suggested?.mergedFromPrevious && !suggested?.nseFetchError && (
                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
                      <p className="text-[10px] font-bold text-amber-400/80">Could not refresh zones from NSE</p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                        Showing last saved bands. Try Refresh Zones again during market hours.
                      </p>
                    </div>
                  )}
                  {suggested?.nseFetchError && (
                    <div className="rounded-lg border border-red-400/25 bg-red-400/[0.06] px-3 py-2.5 space-y-1">
                      <p className="text-[10px] font-bold text-red-400/85">NSE fetch failed</p>
                      {suggested.mergedFromPrevious && (
                        <p className="text-[9px] text-muted-foreground/55">Previous zone bands were kept.</p>
                      )}
                      <p className="text-[9px] font-mono text-muted-foreground/70 break-words">
                        {suggested.nseFetchError}
                      </p>
                    </div>
                  )}
                  {suggested ? (
                    <>
                      {suggested.maxPain && (
                        <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-accent/[0.05] px-3 py-2">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-accent/60">Max Pain — directional target</p>
                            <p className="text-[14px] font-mono font-bold text-accent">₹{suggested.maxPain.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-muted-foreground/40">{suggested.expiryUsed}</p>
                            {suggested.expiryOI && (
                              <p className="text-[9px] font-mono text-muted-foreground/40">{Math.round(suggested.expiryOI / 1000)}k contracts OI</p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-positive/20 bg-positive/[0.04] px-3 py-2.5 space-y-1">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-positive/60" />
                            <p className="text-[9px] font-bold uppercase tracking-widest text-positive/70">Bull entry</p>
                          </div>
                          <p className="text-[12px] font-mono font-bold text-positive">
                            {suggested.bullZoneLow != null && suggested.bullZoneHigh != null
                              ? `₹${suggested.bullZoneLow.toLocaleString()}–${suggested.bullZoneHigh.toLocaleString()}`
                              : "—"}
                          </p>
                          {suggested.bullStrike != null && (
                            <p className="text-[9px] font-mono text-muted-foreground/45">
                              Center ₹{suggested.bullStrike.toLocaleString()}
                            </p>
                          )}
                          {suggested.bullOI && (
                            <p className="text-[9px] text-muted-foreground/40">{Math.round(suggested.bullOI / 1000)}k put OI</p>
                          )}
                        </div>
                        <div className="rounded-lg border border-negative/20 bg-negative/[0.04] px-3 py-2.5 space-y-1">
                          <div className="flex items-center gap-1">
                            <TrendingDown className="w-3 h-3 text-negative/60" />
                            <p className="text-[9px] font-bold uppercase tracking-widest text-negative/70">Bear entry</p>
                          </div>
                          <p className="text-[12px] font-mono font-bold text-negative">
                            {suggested.bearZoneLow != null && suggested.bearZoneHigh != null
                              ? `₹${suggested.bearZoneLow.toLocaleString()}–${suggested.bearZoneHigh.toLocaleString()}`
                              : "—"}
                          </p>
                          {suggested.bearStrike != null && (
                            <p className="text-[9px] font-mono text-muted-foreground/45">
                              Center ₹{suggested.bearStrike.toLocaleString()}
                            </p>
                          )}
                          {suggested.bearOI && (
                            <p className="text-[9px] text-muted-foreground/40">{Math.round(suggested.bearOI / 1000)}k call OI</p>
                          )}
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground/30 text-center">
                        Zones auto-managed · last {new Date(suggested.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </>
                  ) : (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center">
                      <p className="text-[10px] text-muted-foreground/40">No zone data yet</p>
                      <p className="text-[9px] text-muted-foreground/25 mt-1">Hit Refresh Zones below to compute from NSE option chain</p>
                    </div>
                  )}

                  <MomentumFilter
                    value={zones.momentumLookbackMin}
                    onChange={(v) => handleChange("momentumLookbackMin", v)}
                    label="Nifty"
                  />
                </div>
              ) : (
                /* ── Manual Zones tab: editable zone inputs ── */
                <div className="space-y-4">
                  <p className="text-[9px] text-muted-foreground/40 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    These zones are used as a fallback when NSE data is unavailable. NSE option chain data always takes priority in Auto mode.
                  </p>

                  {/* Bull zone */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-white/[0.05]">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-positive/70" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-positive/80">Bull</span>
                      </div>
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
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          Apply NSE
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <PriceInput label="Zone — Low"    description="Nifty must be above this" value={zones.bullZoneLow}    onChange={(v) => handleChange("bullZoneLow", v)} />
                      <PriceInput label="Zone — High"   description="Nifty must be below this" value={zones.bullZoneHigh}   onChange={(v) => handleChange("bullZoneHigh", v)} />
                      <PriceInput label="Exit Bull Above" description="Zone cleared — stop bull" value={zones.bullExitAbove} onChange={(v) => handleChange("bullExitAbove", v)} />
                    </div>
                  </div>

                  {/* Bear zone */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-white/[0.05]">
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5 text-negative/70" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-negative/80">Bear</span>
                      </div>
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
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          Apply NSE
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <PriceInput label="Zone — Low"     description="Nifty must be above this" value={zones.bearZoneLow}    onChange={(v) => handleChange("bearZoneLow", v)} />
                      <PriceInput label="Zone — High"    description="Nifty must be below this" value={zones.bearZoneHigh}   onChange={(v) => handleChange("bearZoneHigh", v)} />
                      <PriceInput label="Exit Bear Below" description="Zone cleared — stop bear" value={zones.bearExitBelow} onChange={(v) => handleChange("bearExitBelow", v)} />
                    </div>
                  </div>

                  <MomentumFilter
                    value={zones.momentumLookbackMin}
                    onChange={(v) => handleChange("momentumLookbackMin", v)}
                    label="Nifty"
                  />
                </div>
              )}
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
              {suggested?.computedAt && !refreshError && (
                <span className="text-[9px] text-muted-foreground/30 truncate">
                  {suggested.source ?? "nse"} · {new Date(suggested.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {refreshError && (
              <p className="text-[9px] text-red-400/80 pl-0.5 font-mono truncate" title={refreshError}>
                ✕ {refreshError}
              </p>
            )}
            {suggested?.expiryUsed && !refreshError && (
              <p className="text-[9px] text-muted-foreground/35 pl-0.5">
                Max Pain{" "}
                <span className="font-mono font-bold text-accent/60">
                  ₹{suggested.maxPain?.toLocaleString() ?? "—"}
                </span>
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
