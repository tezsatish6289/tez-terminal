"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Globe, Loader2, Save, Sliders } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFirestore, useDoc, useMemoFirebase, useUser } from "@/firebase";
import { doc } from "firebase/firestore";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import type { SimBotSettings } from "@/lib/sim-bot-settings";
import { cryptoBotStatus, zoneBotStatus, type CockpitBotStatus } from "@/lib/cockpit-bot-status";
import { BotCardToolbarTrigger } from "@/components/simulator/BotCardToolbarTrigger";
import type { ZoneBotState } from "@/lib/zone-bot-state";

type ManualOverride = "AUTO" | "OFF";

function ZoneEntryFields({
  settings,
  patch,
  botId,
}: {
  settings: SimBotSettings;
  patch: (partial: Partial<SimBotSettings>) => void;
  botId: CockpitBotId;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.05]">
        <Activity className="w-3.5 h-3.5 text-accent/60" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">
          Zone entry
        </span>
      </div>
      {botId === "crypto" && (
        <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
          BTC Deribit OI macro gate — when pattern trades may open relative to suggested
          bull/bear zones and max pain.
        </p>
      )}
      <div className="flex justify-between text-[11px]">
        <span className="font-bold text-foreground/80">Confirm window</span>
        <span className="font-mono font-bold text-accent">
          {settings.zoneConfirmMinutes ?? 15} min
        </span>
      </div>
      <input
        type="range"
        min={5}
        max={60}
        step={5}
        value={settings.zoneConfirmMinutes ?? 15}
        onChange={(e) => patch({ zoneConfirmMinutes: parseInt(e.target.value, 10) })}
        className="w-full accent-accent"
      />
    </div>
  );
}

function NumField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-foreground/80">{label}</label>
      {hint && <p className="text-[9px] text-muted-foreground/45">{hint}</p>}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-full px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[12px] font-mono"
      />
    </div>
  );
}

/** Per-bot config sheet — trading limits + bot-specific gates. */
export function SimBotConfigSheet({
  botId,
  label,
  onStatusChange,
}: {
  botId: CockpitBotId;
  label: string;
  onStatusChange?: (status: CockpitBotStatus) => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [settings, setSettings] = useState<SimBotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [publicLiveDialog, setPublicLiveDialog] = useState<{
    next: boolean;
  } | null>(null);
  const [publicLiveSaving, setPublicLiveSaving] = useState(false);
  const [publicLivePassphrase, setPublicLivePassphrase] = useState("");
  const [publicLiveError, setPublicLiveError] = useState<string | null>(null);

  const apiBase = `/api/settings/sim-bot/${botId}`;
  const publicLiveApi = `${apiBase}/public-live`;
  const isCrypto = botId === "crypto";
  const isZone = botId !== "crypto";

  const macroRef = useMemoFirebase(() => {
    if (!firestore || !isCrypto) return null;
    return doc(firestore, "config", "heatmap_auto_status");
  }, [firestore, isCrypto]);
  const { data: macroData } = useDoc(macroRef);

  const zoneStateRef = useMemoFirebase(() => {
    if (!firestore || !isZone) return null;
    return doc(firestore, "config", `zone_bot_${botId}_state`);
  }, [firestore, isZone, botId]);
  const { data: zoneStateData } = useDoc(zoneStateRef);
  const zoneState = zoneStateData as ZoneBotState | null;

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((data: SimBotSettings) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiBase]);

  const status: CockpitBotStatus = settings
    ? isCrypto
      ? cryptoBotStatus(settings, macroData as { simEnabled?: boolean; reason?: string } | null)
      : zoneBotStatus(settings, zoneState)
    : { power: "idle", label: "…" };

  useEffect(() => {
    onStatusChange?.(status);
  }, [status.power, status.label, status.detail, onStatusChange]);

  const patch = useCallback((partial: Partial<SimBotSettings>) => {
    setSettings((p) => (p ? { ...p, ...partial } : p));
    setDirty(true);
  }, []);

  const handleOverride = useCallback(
    async (override: ManualOverride) => {
      patch({ manualOverride: override });
      try {
        await fetch(apiBase, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manualOverride: override }),
        });
        setDirty(false);
      } catch (err) {
        console.error(`[SimBotConfig ${botId}] override failed:`, err);
      }
    },
    [apiBase, botId, patch],
  );

  const handlePublicLiveConfirm = useCallback(async () => {
    if (!settings || publicLiveDialog == null) return;
    if (!user) {
      setPublicLiveError("Sign in as an admin to change public visibility.");
      return;
    }
    if (!publicLivePassphrase.trim()) {
      setPublicLiveError("Enter the public-live passphrase.");
      return;
    }

    setPublicLiveSaving(true);
    setPublicLiveError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(publicLiveApi, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          publicLive: publicLiveDialog.next,
          passphrase: publicLivePassphrase,
        }),
      });
      const data = (await res.json()) as SimBotSettings & { error?: string };
      if (!res.ok) {
        setPublicLiveError(data.error ?? "Could not update public visibility.");
        return;
      }
      setSettings(data);
      setPublicLiveDialog(null);
      setPublicLivePassphrase("");
    } catch (err) {
      console.error(`[SimBotConfig ${botId}] publicLive failed:`, err);
      setPublicLiveError("Request failed. Try again.");
    } finally {
      setPublicLiveSaving(false);
    }
  }, [user, publicLiveApi, botId, publicLiveDialog, publicLivePassphrase, settings]);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { publicLive: _omit, ...tradingSettings } = settings;
      const res = await fetch(apiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradingSettings),
      });
      const merged = (await res.json()) as SimBotSettings;
      setSettings(merged);
      setDirty(false);
    } catch (err) {
      console.error(`[SimBotConfig ${botId}] save failed:`, err);
    } finally {
      setSaving(false);
    }
  }, [apiBase, settings, botId]);

  const isForcedOff = settings?.manualOverride === "OFF";

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <BotCardToolbarTrigger
        isForcedOff={isForcedOff}
        power={status.power}
        sheetLabel="Config"
        onConfigClick={() => setSheetOpen(true)}
        onAutoToggle={() => {
          void handleOverride(isForcedOff ? "AUTO" : "OFF");
        }}
      />

      <SheetContent
        side="right"
        className="w-[400px] sm:w-[440px] flex flex-col gap-0 p-0 z-[100]"
      >
        <SheetHeader className="px-5 py-4 border-b border-white/[0.06]">
          <SheetTitle className="text-[13px] font-black uppercase tracking-widest">
            {label} settings
          </SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground/50">
            {isCrypto
              ? "Pattern bot limits plus BTC zone gates (confirm window, max pain)."
              : "Max trades, risk, and zone entry rules for this bot only."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {loading || !settings ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-accent/50" />
            </div>
          ) : (
            <>
              <div className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-accent/60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">
                    FreedomBot public
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
                  When on, {label} appears on freedombot.ai performance, records, and
                  deploy. Requires admin sign-in and passphrase to change.
                </p>
                <div className="flex gap-2">
                  {([true, false] as const).map((live) => (
                    <button
                      key={live ? "on" : "off"}
                      type="button"
                      disabled={publicLiveSaving}
                      onClick={() => {
                        if (settings.publicLive === live) return;
                        setPublicLiveDialog({ next: live });
                      }}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all",
                        settings.publicLive === live
                          ? live
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                            : "bg-white/[0.04] border-white/[0.12] text-muted-foreground/70"
                          : "border-white/[0.08] text-muted-foreground/50 hover:bg-white/[0.04]",
                      )}
                    >
                      {live ? "Live" : "Hidden"}
                    </button>
                  ))}
                </div>
              </div>

              <AlertDialog
                open={publicLiveDialog != null}
                onOpenChange={(open) => {
                  if (!open) {
                    setPublicLiveDialog(null);
                    setPublicLivePassphrase("");
                    setPublicLiveError(null);
                  }
                }}
              >
                <AlertDialogContent className="bg-[#0a0a0c] border-white/10">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">
                      {publicLiveDialog?.next ? "Go live on FreedomBot?" : "Hide from public?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3 text-sm text-muted-foreground">
                        <p>
                          {publicLiveDialog?.next
                            ? `${label} will appear on freedombot.ai performance, records, and deploy. Simulator trading is unchanged.`
                            : `${label} will be hidden from freedombot.ai and marked Coming Soon. Existing user deployments are not changed.`}
                        </p>
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`public-live-pass-${botId}`}
                            className="text-[10px] font-bold uppercase tracking-wider text-foreground/70"
                          >
                            Public-live passphrase
                          </label>
                          <input
                            id={`public-live-pass-${botId}`}
                            type="password"
                            autoComplete="off"
                            value={publicLivePassphrase}
                            onChange={(e) => {
                              setPublicLivePassphrase(e.target.value);
                              setPublicLiveError(null);
                            }}
                            placeholder="Required"
                            className="w-full px-3 py-2 rounded-lg border border-white/[0.12] bg-white/[0.03] text-[12px] font-mono text-foreground"
                          />
                        </div>
                        {publicLiveError && (
                          <p className="text-[11px] font-semibold text-rose-400">{publicLiveError}</p>
                        )}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={publicLiveSaving || !publicLivePassphrase.trim()}
                      className={cn(
                        publicLiveDialog?.next
                          ? "bg-emerald-600 hover:bg-emerald-500"
                          : "bg-rose-600 hover:bg-rose-500",
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        void handlePublicLiveConfirm();
                      }}
                    >
                      {publicLiveSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : publicLiveDialog?.next ? (
                        "Publish"
                      ) : (
                        "Hide"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

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

              {zoneState?.reason && isZone && (
                <p className="text-[10px] font-mono text-muted-foreground/55 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  {zoneState.reason}
                </p>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.05]">
                  <Sliders className="w-3.5 h-3.5 text-accent/60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">
                    Position sizing
                  </span>
                </div>
                <NumField
                  label="Max open trades"
                  hint="Concurrent OPEN positions for this bot only"
                  value={settings.maxOpenTrades}
                  min={1}
                  max={10}
                  onChange={(v) => patch({ maxOpenTrades: Math.round(v) })}
                />
                <NumField
                  label="Risk per trade (%)"
                  hint="Share of sim capital risked per entry (1 = 1%)"
                  value={Math.round(settings.riskPerTradePct * 1000) / 10}
                  min={0.5}
                  max={5}
                  step={0.1}
                  onChange={(v) => patch({ riskPerTradePct: v / 100 })}
                />
              </div>

              {isCrypto && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-white/[0.05]">
                    <Activity className="w-3.5 h-3.5 text-accent/60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent/80">
                      Signal filters
                    </span>
                  </div>
                  <NumField
                    label="Minimum score"
                    value={settings.minScore ?? 65}
                    min={40}
                    max={90}
                    onChange={(v) => patch({ minScore: Math.round(v) })}
                  />
                  <NumField
                    label="Max SL distance (%)"
                    value={Math.round((settings.maxSlDistancePct ?? 0.03) * 1000) / 10}
                    min={2}
                    max={20}
                    step={0.5}
                    onChange={(v) => patch({ maxSlDistancePct: v / 100 })}
                  />
                  <NumField
                    label="Max TP1 consumed (%)"
                    value={Math.round((settings.maxTp1ConsumedPct ?? 0.65) * 100)}
                    min={10}
                    max={90}
                    onChange={(v) => patch({ maxTp1ConsumedPct: v / 100 })}
                  />
                  <NumField
                    label="Streak risk (%)"
                    value={Math.round((settings.riskPerTradeStreakPct ?? 0.015) * 1000) / 10}
                    min={0.5}
                    max={5}
                    step={0.1}
                    onChange={(v) => patch({ riskPerTradeStreakPct: v / 100 })}
                  />
                  <NumField
                    label="Max trades on streak"
                    value={settings.maxOpenTradesStreakCap ?? 6}
                    min={settings.maxOpenTrades}
                    max={10}
                    onChange={(v) => patch({ maxOpenTradesStreakCap: Math.round(v) })}
                  />
                </div>
              )}

              {(isCrypto || isZone) && (
                <ZoneEntryFields settings={settings} patch={patch} botId={botId} />
              )}

              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void handleSave()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-black text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save settings
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
