"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Zap, TrendingUp, TrendingDown, PowerOff, Activity, RefreshCw, Info } from "lucide-react";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { doc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { cryptoBotStatus, type CockpitBotStatus } from "@/lib/cockpit-bot-status";
import { BotCardToolbarTrigger } from "@/components/simulator/BotCardToolbarTrigger";
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
  momentumLookbackMin: number | null; // legacy — removed, kept for type compat during migration
  zoneConfirmMinutes:  number | null;
  zoneHalfWidthUsd:    number | null;
}

interface AutoStatus {
  btcPrice:      number | null;
  simEnabled:    boolean;
  directionBias: "BULL" | "BEAR" | "BOTH";
  reason:        string;
  updatedAt:     string;
}

// ZoneBotState / ZoneBotConfirmation interfaces removed 2026-05-19
// alongside the inline BTC Zone Bot status card. Restore from
// git show 0c21879~1 if the card ever comes back.

// ── Compact-banner helpers ──────────────────────────────────────────────
//
// `heatmap-zones-settings.ts` emits verbose `status.reason` strings like
// "OFF — BTC $76,951.8 above bull exit $76,543.86" so the admin pages can
// show precise diagnostic info. The Heatmap Auto-Switch panel doesn't
// need that level of detail at a glance — we strip the price portions
// here and (when both sides are dead) tack on a "no X setup (reason)"
// suffix derived from `suggested.notActionableReason`. Source layer is
// intentionally left verbose so other consumers stay informative; this
// is a UI-only summarisation pass.

/** Shorten the verbose `OFF — BTC $X above bull exit $Y` style of
 *  status.reason to a side-only descriptor. Unrecognised patterns pass
 *  through unchanged so we don't accidentally drop diagnostic info. */
function compactStatusReason(reason: string): string {
  if (/^OFF — BTC \$[\d,.]+ above bull exit/i.test(reason))     return "OFF — bull zone exited above";
  if (/^OFF — BTC \$[\d,.]+ below bear exit/i.test(reason))     return "OFF — bear zone exited below";
  if (/^OFF — BTC \$[\d,.]+ above bear zone top/i.test(reason)) return "OFF — above bear zone";
  if (/^OFF — BTC \$[\d,.]+ below bull zone/i.test(reason))     return "OFF — below bull zone";
  if (/^OFF — BTC \$[\d,.]+ between zones/i.test(reason))       return "OFF — between zones";
  return reason;
}

/** Map the suggester's verbose `notActionableReason` to a one-clause
 *  summary that fits inside the banner suffix. Signal-conflict variants
 *  are handled by their own dedicated alert card and so deliberately
 *  bypass this helper at the call site. */
function shortNotActionable(reason: string | null | undefined): string | null {
  if (!reason) return null;
  // New TP-room format (2026-05-19) carries the actual numbers — e.g.
  // "TP room $882 from bull zone $76,000 to max pain $77,500 — need
  // $1,238 (2× halfWidth $1,238)". For the banner suffix we keep just
  // the "TP room $X / need $Y" headline so the operator gets the
  // diagnosis at a glance; the full sentence lives in the dedicated
  // alert card below.
  const tpRoomMatch = reason.match(/^TP room (\$[\d,]+)[\s\S]*?need (\$[\d,]+)/);
  if (tpRoomMatch) return `TP room ${tpRoomMatch[1]} / need ${tpRoomMatch[2]}`;
  if (reason.startsWith("TP room insufficient")) return "max pain too close"; // legacy fallback
  if (reason.startsWith("Pin chop"))             return "pin chop near max pain";
  if (reason.startsWith("No big cluster"))       return "no cluster in reach";
  if (reason.startsWith("Panic regime"))         return "panic regime";
  return reason;
}

/** Tells us which side the banner's compact reason is describing so the
 *  "no <other> setup (...)" suffix points at the missing side. Returns
 *  null when both sides are equally dormant (e.g. "between zones"). */
function detectBannerSide(reason: string): "bull" | "bear" | null {
  if (/bull (exit|zone)/i.test(reason)) return "bull";
  if (/bear (exit|zone)/i.test(reason)) return "bear";
  return null;
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
  btcPrice:          number | null;
  deribitIndexPrice: number | null;
  source:            string;
  computedAt:        string;

  // ── v2 fields (added 2026-05-19) — all optional for back-compat with
  //    pre-v2 suggested_zones docs that haven't been re-computed yet. ────
  /** ATM IV (decimal, e.g. 0.3134 = 31.34%) used to derive all sizes. */
  atmIV?:               number | null;
  /** front IV / week IV. ≥ 1.10 = backwardation / panic regime. */
  ivBackwardation?:     number | null;
  /** ATM IV ≥ 70% OR term-structure inverted. Fresh entries suppressed. */
  inPanicRegime?:       boolean | null;
  /** Auto-derived half-width (1-σ × 4 hours, floored/capped). */
  halfWidthUsd?:        number | null;
  /** Reach band radius (1-σ × 1 day). Strikes outside this aren't picked. */
  maxReachUsd?:         number | null;
  /** Pin-gap threshold (0.5 × halfWidth). */
  minPinGapUsd?:        number | null;
  /** Suggester verdict: BULL entries safe? Considers magnet, TP-room, regime. */
  bullActionable?:      boolean | null;
  bearActionable?:      boolean | null;
  /** Human-readable explanation when both sides aren't actionable. */
  notActionableReason?: string | null;
  /** Share of side OI captured by the chosen cluster strike (0..1). */
  bullClusterShare?:    number | null;
  bearClusterShare?:    number | null;
}

const EMPTY_ZONES: HeatmapZones = {
  bullZoneLow: null, bullZoneHigh: null, bullExitAbove: null,
  bearZoneHigh: null, bearZoneLow: null, bearExitBelow: null,
  manualOverride: "AUTO",
  momentumLookbackMin: null,
  zoneConfirmMinutes: 15,
  zoneHalfWidthUsd: null,
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

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center cursor-help">
      <Info className="w-3 h-3 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-white/[0.10] bg-[#1a1a2e] px-3 py-2 text-[10px] leading-relaxed text-muted-foreground/80 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a2e]" />
      </span>
    </span>
  );
}

function ZoneConfirmationWindow({
  value, onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const current = value ?? 15;
  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.05]">
        <Activity className="w-3.5 h-3.5 text-accent/60" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">Zone Confirmation</span>
        <InfoTip text="Before opening any trade, BTC must hold above the zone floor for this many minutes without making new lows (BULL) or new highs (BEAR). Prevents entering trades while BTC is still falling through the zone. Status shows 'CONFIRMING (X / N min)' while waiting." />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-foreground/80">Confirmation Window</label>
          <span className="text-[11px] font-mono font-bold text-accent">{current} min</span>
        </div>
        <input
          type="range" min={5} max={60} step={5} value={current}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground/30">
          <span>5 min</span><span>60 min</span>
        </div>
        <p className="text-[9px] text-muted-foreground/40 pt-0.5">
          BTC must hold above the zone floor for this window without making new lows before any trades open.
          Status shows &ldquo;CONFIRMING (X / {current} min)&rdquo; while waiting.
        </p>
      </div>
    </div>
  );
}

export function HeatmapAutoSwitch({
  onStatusChange,
}: {
  /** Live Bot ON/OFF for the Crypto Bot heatmap card. */
  onStatusChange?: (status: CockpitBotStatus) => void;
}) {
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
  const { data: statusData, refetch: refetchStatus } = useDoc(statusRef);
  const status = statusData as AutoStatus | null;

  const suggestedRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, "config", "suggested_zones");
  }, [firestore]);
  const { data: suggestedData, refetch: refetchSuggested } = useDoc(suggestedRef);
  const suggested = suggestedData as SuggestedZones | null;

  // BTC Zone Bot status doc (config/zone_bot_btc_state) is no longer
  // read here — see the marker comment further down where the inline
  // status card used to render. The cron writing that doc still runs.

  // Match the simulation page cadence: refresh status while the tab is
  // visible (zero cost while hidden) so AUTO/Bull/Bear and Deribit zones
  // stay current without listeners.
  useAutoRefresh([refetchStatus, refetchSuggested], 60_000);

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

  // handleRefreshZoneBot removed 2026-05-19 with the inline card.

  const override    = zones.manualOverride;
  const isForcedOff = override === "OFF";
  const effectiveOn = isForcedOff ? false : (status?.simEnabled ?? false);
  const effectiveBull = !isForcedOff && status?.simEnabled && status?.directionBias === "BULL";

  useEffect(() => {
    onStatusChange?.(cryptoBotStatus(zones, status));
  }, [zones.manualOverride, status?.simEnabled, status?.directionBias, onStatusChange]);

  const cardPower = isForcedOff
    ? "off"
    : effectiveOn
      ? "on"
      : "idle";

  const triggerColor = isForcedOff
    ? "bg-white/[0.04] text-muted-foreground/40 border-white/[0.06]"
    : "bg-accent/15 text-accent border-accent/20";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <BotCardToolbarTrigger
          tradingMode={isForcedOff ? "OFF" : "SIM_LIVE"}
          power={cardPower}
          sheetLabel="Config"
          onTradingModeChange={(next) => {
            void handleOverride(next === "OFF" ? "OFF" : "AUTO");
          }}
        />
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
                {/* Banner-line rendering. Dedicated alert cards still own
                    the signalConflict explanation (it needs the full
                    paragraph), so we short-circuit it to a "see alert
                    below" pointer. For every other case the banner now
                    also absorbs what used to live in the "No actionable
                    side right now" card — combined form is:
                       BTC $X · {compact status} · no <side> setup (<short reason>)
                    e.g.  BTC $76,951.8 · OFF — bull zone exited above · no bear setup (max pain too close) */}
                {(() => {
                  if (suggested?.signalConflict)  return "Signal conflict — entries suppressed (see alert below)";
                  const compact = compactStatusReason(status.reason);
                  const bothDead =
                    suggested?.bullActionable === false &&
                    suggested?.bearActionable === false;
                  if (!bothDead) return compact;
                  const short = shortNotActionable(suggested?.notActionableReason);
                  if (!short) return compact;
                  const side = detectBannerSide(status.reason);
                  if (side === "bull") return `${compact} · no bear setup (${short})`;
                  if (side === "bear") return `${compact} · no bull setup (${short})`;
                  return `${compact} · ${short}`;
                })()}
              </span>
            ) : (
              <span className="text-muted-foreground/40">Waiting for first cron cycle…</span>
            )}
          </div>

          {/* ── BTC Zone Bot status card removed 2026-05-19 ───────────
              The inline status panel that used to live here (showing
              direction badge, confirming countdown, reason string from
              the cron, open trade id, and a manual "Tick" button) was
              dropped from the UI on user request — operator visibility
              for the BTC Zone Bot lives on the admin + simulation
              dashboards now, this card was duplicating that view.

              The Zone Bot itself is untouched. The cron pipeline still
              runs end-to-end:

                /api/cron/suggest-zones       (every 15 min)
                  └─ writes config/suggested_zones_btc
                       └─ /api/cron/sync-zone-bots (every 1 min)
                             └─ reads it, writes config/zone_bot_btc_state

              To bring the card back, re-add the <div> block + the
              `zoneBotStateRef` / `useDoc` / `handleRefreshZoneBot`
              helpers — see git show 0c21879~1 -- src/components/simulator/HeatmapAutoSwitch.tsx
              for the last working snapshot. The supporting hooks,
              handler, and type defs are also removed in this commit. */}

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
                  {/* ── Regime context (atmIV, reach, sizes) ──
                      v2 transparency strip. Surfaces the suggester's
                      auto-derived numbers so the bot's idle/active state
                      is never a black box. */}
                  {(suggested.atmIV != null || suggested.halfWidthUsd != null) && (() => {
                    const iv         = suggested.atmIV ?? null;
                    const ivPct      = iv != null ? iv * 100 : null;
                    const spot       = suggested.deribitIndexPrice ?? suggested.btcPrice ?? null;
                    const reach      = suggested.maxReachUsd ?? null;
                    const half       = suggested.halfWidthUsd ?? null;
                    const panic      = suggested.inPanicRegime === true;
                    // Regime colour: green calm < 50%, amber elevated 50-70%, red panic ≥ 70%.
                    const ivColor =
                      panic                         ? "bg-negative/15 border-negative/30 text-negative"
                      : ivPct != null && ivPct >= 50 ? "bg-amber-400/15 border-amber-400/30 text-amber-300"
                      :                                "bg-positive/15 border-positive/30 text-positive/90";

                    return (
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/55 shrink-0">Regime</span>
                            {ivPct != null && (
                              <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold", ivColor)}>
                                ATM IV {ivPct.toFixed(1)}%
                              </span>
                            )}
                            {panic && (
                              <span className="text-[8px] font-bold uppercase tracking-wider text-negative/80">PANIC</span>
                            )}
                            <InfoTip text="ATM IV is the market's expected 1-σ daily move. < 50% = calm, 50-70% = elevated, ≥ 70% or inverted term structure = panic (fresh entries suppressed). Drives every distance below via Black-Scholes σ math — no arbitrary $-numbers." />
                          </div>
                        </div>
                        {(half != null || reach != null) && (
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                            {half != null && (
                              <div className="rounded border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
                                <p className="text-[8px] uppercase tracking-wider text-muted-foreground/45">Half-width</p>
                                <p className="text-[11px] font-bold text-foreground/85">±${Math.round(half).toLocaleString()}</p>
                                <p className="text-[8px] text-muted-foreground/35">4h × 1σ (auto)</p>
                              </div>
                            )}
                            {reach != null && spot != null && (
                              <div className="rounded border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
                                <p className="text-[8px] uppercase tracking-wider text-muted-foreground/45">Reach band</p>
                                <p className="text-[11px] font-bold text-foreground/85">±${Math.round(reach).toLocaleString()}</p>
                                <p className="text-[8px] text-muted-foreground/35">
                                  ${Math.round(spot - reach).toLocaleString()}–${Math.round(spot + reach).toLocaleString()}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* "No actionable side right now" yellow alert removed
                      2026-05-19. It used to surface here when both sides
                      were idle for reasons other than spot-position
                      (TP-room insufficient, pin chop, no cluster in
                      reach, panic regime). That same information is now
                      folded into the status banner at the top of the
                      panel as a "· no <side> setup (<short reason>)"
                      suffix — see compactStatusReason /
                      shortNotActionable helpers at the top of this file.
                      The dedicated SignalConflict and InsufficientGap
                      alerts below stay because each one needs a
                      multi-line explanation that doesn't fit in the
                      banner. */}

                  {/* Signal conflict warning */}
                  {suggested.signalConflict && (
                    <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2.5">
                      <p className="text-[10px] font-bold text-amber-400/90">Signal Conflict — expiry disagreement</p>
                      <p className="text-[9px] text-muted-foreground/55 mt-0.5">
                        Day 0 and Day 1 max pain are on opposite sides of current price. MMs have competing incentives. Trade with extra caution.
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

                  {/* Bull / Bear zone cards. v2: cluster-share badge, dim
                      when not actionable, fixed legacy "(wtd)" label. */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={cn(
                      "rounded-lg border border-positive/20 bg-positive/[0.04] px-3 py-2.5 space-y-1 transition-opacity",
                      suggested.bullStrike != null && suggested.bullActionable === false && "opacity-55",
                    )}>
                      <div className="flex items-center gap-1 justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                          <TrendingUp className="w-3 h-3 text-positive/60 shrink-0" />
                          <p className="text-[9px] font-bold uppercase tracking-widest text-positive/70">Bull entry</p>
                        </div>
                        {suggested.bullStrike != null && suggested.bullActionable === false && (
                          <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/[0.06] text-muted-foreground/60 shrink-0">
                            Idle
                          </span>
                        )}
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] text-muted-foreground/40">
                                {Math.round(suggested.bullOI ?? suggested.bullVolume ?? 0)}c put OI (all expiries)
                              </span>
                              {suggested.bullClusterShare != null && (
                                <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-positive/15 text-positive/75">
                                  {Math.round(suggested.bullClusterShare * 100)}% of side
                                </span>
                              )}
                            </div>
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
                          {/* The card-level italic only fires when ONLY this
                              side is non-actionable (bear is still in play).
                              When both sides are dead OR there's a signal
                              conflict / insufficient gap, the dedicated
                              alert card directly above this row already
                              displays the same `notActionableReason` — no
                              need to echo it inside the bull card too. */}
                          {suggested.bullActionable === false && suggested.bearActionable === true && suggested.notActionableReason && (
                            <p className="text-[8px] text-muted-foreground/40 pt-1 italic">
                              {suggested.notActionableReason}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/40 pt-1">
                          {suggested.bullOI ? "Put support found — max pain too close to TP zone. No bull trades." : "No put cluster found below price."}
                        </p>
                      )}
                    </div>
                    <div className={cn(
                      "rounded-lg border border-negative/20 bg-negative/[0.04] px-3 py-2.5 space-y-1 transition-opacity",
                      suggested.bearStrike != null && suggested.bearActionable === false && "opacity-55",
                    )}>
                      <div className="flex items-center gap-1 justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                          <TrendingDown className="w-3 h-3 text-negative/60 shrink-0" />
                          <p className="text-[9px] font-bold uppercase tracking-widest text-negative/70">Bear entry</p>
                        </div>
                        {suggested.bearStrike != null && suggested.bearActionable === false && (
                          <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/[0.06] text-muted-foreground/60 shrink-0">
                            Idle
                          </span>
                        )}
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] text-muted-foreground/40">
                                {Math.round(suggested.bearOI ?? suggested.bearVolume ?? 0)}c call OI (all expiries)
                              </span>
                              {suggested.bearClusterShare != null && (
                                <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-negative/15 text-negative/75">
                                  {Math.round(suggested.bearClusterShare * 100)}% of side
                                </span>
                              )}
                            </div>
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
                          {/* Symmetric to BULL card — only show when ONLY
                              the bear side is dead. If both sides are
                              non-actionable / there's a signal conflict /
                              insufficient gap, the dedicated alert above
                              owns the message. */}
                          {suggested.bearActionable === false && suggested.bullActionable === true && suggested.notActionableReason && (
                            <p className="text-[8px] text-muted-foreground/40 pt-1 italic">
                              {suggested.notActionableReason}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/40 pt-1">
                          {suggested.bearOI ? "Call resistance found — max pain too close to TP zone. No bear trades." : "No call cluster found above price."}
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

              {/* Half-width is now auto-derived per call from ATM IV
                  (1-σ × 4h, floored at 2-σ × 15min, capped at 2% of spot).
                  The manual input was removed 2026-05-19. The actual value
                  is shown in the Regime card at the top of this panel. */}

              {/* Max-pain exit logic (and the proximity input) was retired
                  2026-05-23. Open trades now exit purely on their own
                  SL / TP / trailing-SL via sync-simulator's universal
                  lifecycle loop. The "Min strike ↔ max-pain distance"
                  ENTRY gate was removed 2026-05-22 — the picker uses
                  `2 × halfWidth` (auto-tunes to ATM IV) for that gap.
                  See `MAX_PAIN_GAP_HALFWIDTHS` in options-zones.ts. */}

              <ZoneConfirmationWindow value={zones.zoneConfirmMinutes} onChange={(v) => handleChange("zoneConfirmMinutes", v)} />
            </div>
          )}
        </div>

        {/* Footer.
            Refresh-zones button + freshness beacon on the left, Save
            button on the right. The beacon (added 2026-05-19) is the
            primary "is the suggest-zones cron still ticking?" signal —
            green pulse means the doc is <30 min old, amber means
            >30 min, red means >12h (engine treats data as missing).
            Previously this row also restated `deribit · HH:MM` and
            `Max Pain $X · YYMONyy` — both duplicated content shown
            above the cards, dropped in the dedup pass. */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleRefreshSuggestions}
              disabled={refreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05] transition-all disabled:opacity-40 shrink-0"
            >
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
              {refreshing ? "Fetching…" : "Refresh Zones"}
            </button>
            {/* Health beacon next to Refresh button — gives instant
                visual confirmation that the suggest-zones cron is
                ticking. Green pulse = fresh (<30 min, well within the
                15-min cadence). Amber = >30 min stale (one cron miss
                or cron-job.org degraded). Red = >12h (engine treats
                the data as missing entirely; bots IDLE out). */}
            {suggested?.computedAt && (() => {
              const ageMs    = Date.now() - new Date(suggested.computedAt).getTime();
              const ageMin   = Math.floor(ageMs / 60_000);
              const fresh    = ageMin < 30;
              const veryStale = ageMin >= 12 * 60;
              const dotColor = veryStale
                ? "bg-red-400"
                : fresh
                  ? "bg-positive"
                  : "bg-amber-400";
              const textColor = veryStale
                ? "text-red-400/80"
                : fresh
                  ? "text-muted-foreground/55"
                  : "text-amber-400/80";
              const ageLabel =
                ageMin < 1   ? "just now" :
                ageMin < 60  ? `${ageMin}m ago` :
                ageMin < 1440 ? `${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago` :
                                `${Math.floor(ageMin / 1440)}d ago`;
              return (
                <span className={cn("flex items-center gap-1.5 text-[9px] font-mono truncate", textColor)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor, fresh && "animate-pulse")} />
                  <span className="truncate">
                    Refreshed {new Date(suggested.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {ageLabel}
                  </span>
                </span>
              );
            })()}
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
