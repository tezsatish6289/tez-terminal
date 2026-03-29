"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings2, Loader2, RotateCcw, Save } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface ParamDef {
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  format: "pct" | "pctDecimal" | "number" | "ratio";
}

const PARAM_GROUPS: { title: string; params: ParamDef[] }[] = [
  {
    title: "Confidence & Scoring",
    params: [
      { key: "CONFIDENCE_MIN", label: "Min Confidence", description: "Minimum AI confidence score to enter a trade", min: 30, max: 90, step: 1, format: "number" },
      { key: "CONFIDENCE_MIN_LOW_SAMPLE", label: "Min Confidence (Low Sample)", description: "Higher threshold when win rate data is limited", min: 30, max: 90, step: 1, format: "number" },
      { key: "SCORE_FLOOR", label: "Score Floor (Exit)", description: "Exit trade if live score drops below this", min: 20, max: 60, step: 1, format: "number" },
    ],
  },
  {
    title: "Win Rate Gates",
    params: [
      { key: "LIVE_WIN_RATE_MIN", label: "Min Live Win Rate", description: "Block trades if live win rate drops below this", min: 0.3, max: 0.9, step: 0.05, format: "pctDecimal" },
      { key: "LIVE_WIN_RATE_SAMPLE_MIN", label: "Min Live Samples", description: "Win rate gate activates after this many closed trades", min: 1, max: 10, step: 1, format: "number" },
      { key: "ALGO_HIST_WIN_RATE_MIN", label: "Min Algo Win Rate", description: "Block algo+timeframe if historical win rate is below this", min: 0.3, max: 0.9, step: 0.05, format: "pctDecimal" },
      { key: "ALGO_HIST_SAMPLE_MIN", label: "Min Algo Samples", description: "Algo gate activates after this many closed trades", min: 1, max: 20, step: 1, format: "number" },
    ],
  },
  {
    title: "Market Bias & Chop Filter",
    params: [
      { key: "BIAS_GAP_MIN", label: "Min Bias Gap", description: "Minimum bull-bear score difference to confirm market direction", min: 2, max: 30, step: 1, format: "number" },
      { key: "CHOP_THRESHOLD", label: "Chop Threshold", description: "Block trades if chop ratio exceeds this (0 = trending, 1 = pure chop)", min: 0.1, max: 0.9, step: 0.05, format: "ratio" },
    ],
  },
  {
    title: "Position Sizing & Risk",
    params: [
      { key: "RISK_PER_TRADE_BASE", label: "Base Risk per Trade", description: "Capital risked per trade in normal mode", min: 0.001, max: 0.03, step: 0.001, format: "pctDecimal" },
      { key: "RISK_PER_TRADE_STREAK", label: "Streak Risk per Trade", description: "Capital risked per trade when streak is active", min: 0.005, max: 0.05, step: 0.005, format: "pctDecimal" },
      { key: "MAX_OPEN_TRADES_BASE", label: "Base Max Open Trades", description: "Concurrent trades allowed without a streak", min: 1, max: 5, step: 1, format: "number" },
      { key: "MAX_OPEN_TRADES_CAP", label: "Hard Cap Open Trades", description: "Maximum concurrent trades even with a hot streak", min: 1, max: 10, step: 1, format: "number" },
      { key: "STREAK_WINS_TO_SCALE", label: "Wins to Scale", description: "Consecutive wins needed before scaling up", min: 1, max: 5, step: 1, format: "number" },
    ],
  },
  {
    title: "Incubation Filters",
    params: [
      { key: "INCUBATED_SL_CONSUMED_MAX", label: "Max SL Consumed", description: "Skip incubated signal if price has moved this far toward SL", min: 0.1, max: 0.8, step: 0.05, format: "pctDecimal" },
      { key: "INCUBATED_TP1_CONSUMED_MAX", label: "Max TP1 Consumed", description: "Skip incubated signal if price has already reached this far toward TP1", min: 0.1, max: 0.9, step: 0.05, format: "pctDecimal" },
    ],
  },
];

function formatValue(val: number, format: ParamDef["format"]): string {
  switch (format) {
    case "pct":
      return `${val}%`;
    case "pctDecimal":
      return `${(val * 100).toFixed(1)}%`;
    case "ratio":
      return val.toFixed(2);
    case "number":
      return val.toString();
    default:
      return val.toString();
  }
}

type ParamValues = Record<string, number>;

export function SimulatorParamsDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<ParamValues>({});
  const [defaults, setDefaults] = useState<ParamValues>({});
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/simulator-params");
      const data = await res.json();
      setValues(data.effective ?? {});
      setDefaults(data.defaults ?? {});
      setDirty(false);
    } catch (err) {
      console.error("Failed to load simulator params:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleChange = (key: string, val: number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const handleReset = () => {
    setValues({ ...defaults });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const overrides: ParamValues = {};
      for (const [key, val] of Object.entries(values)) {
        const def = defaults[key];
        if (def !== undefined && val !== def) {
          overrides[key] = val;
        }
      }
      await fetch("/api/settings/simulator-params", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      setDirty(false);
    } catch (err) {
      console.error("Failed to save simulator params:", err);
    } finally {
      setSaving(false);
    }
  };

  const isModified = (key: string) => {
    const def = defaults[key];
    const cur = values[key];
    return def !== undefined && cur !== undefined && def !== cur;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 hover:text-foreground transition-all">
          <Settings2 className="w-3.5 h-3.5" />
          Tune Parameters
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-background/95 backdrop-blur-xl border-white/[0.06]">
        <SheetHeader className="pb-4 border-b border-white/[0.06]">
          <SheetTitle className="text-base font-black tracking-tight">Simulator Parameters</SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground/60">
            Tune the gates that control when the simulator takes or rejects trades. Changes apply to both simulation and live trading.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {PARAM_GROUPS.map((group) => (
              <div key={group.title} className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-accent/80">{group.title}</h3>
                <div className="space-y-4">
                  {group.params.map((p) => {
                    const val = values[p.key] ?? 0;
                    const modified = isModified(p.key);
                    return (
                      <div key={p.key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-foreground/80">{p.label}</label>
                          <span className={cn(
                            "text-[11px] font-mono font-bold tabular-nums",
                            modified ? "text-amber-400" : "text-muted-foreground/60",
                          )}>
                            {formatValue(val, p.format)}
                            {modified && (
                              <span className="text-[9px] text-muted-foreground/40 ml-1">
                                (def: {formatValue(defaults[p.key], p.format)})
                              </span>
                            )}
                          </span>
                        </div>
                        <Slider
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          value={[val]}
                          onValueChange={([v]) => handleChange(p.key, v)}
                          className="w-full"
                        />
                        <p className="text-[9px] text-muted-foreground/40">{p.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4 border-t border-white/[0.06]">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-foreground transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to Defaults
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ml-auto",
                  dirty
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-white/[0.03] text-muted-foreground/30 cursor-not-allowed border border-white/[0.06]",
                )}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
