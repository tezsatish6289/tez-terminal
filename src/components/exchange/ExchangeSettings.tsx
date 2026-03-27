"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Zap, Eye, EyeOff, Shield, Power, AlertTriangle, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ExchangeConfig {
  configured: boolean;
  autoTradeEnabled: boolean;
  keyLastFour: string;
  riskPerTrade: number;
  maxConcurrentTrades: number;
  dailyLossLimit: number;
  useTestnet: boolean;
  savedAt: string | null;
}

interface ExchangeSettingsProps {
  uid: string;
  mode: "testnet" | "production";
}

export function useExchangeConfig(uid: string | undefined) {
  const [config, setConfig] = useState<ExchangeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/settings/binance?uid=${uid}`);
      const data = await res.json();
      setConfig(data);
    } catch {
      console.error("Failed to fetch exchange config");
    } finally {
      setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (uid) fetchConfig();
  }, [uid, fetchConfig]);

  const updateSetting = async (field: string, value: unknown) => {
    if (!uid) return;
    try {
      const res = await fetch("/api/settings/binance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, [field]: value }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig((prev) => prev ? { ...prev, [field]: value } : null);
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    }
  };

  return { config, isLoading, setConfig, fetchConfig, updateSetting };
}

export function ExchangeSettingsDialog({ uid, mode }: ExchangeSettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-accent hover:bg-accent/5 transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        Settings
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-accent/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              Bybit {mode === "testnet" ? "Testnet" : "Production"} Settings
            </DialogTitle>
          </DialogHeader>
          <ExchangeSettingsPanel uid={uid} mode={mode} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExchangeSettingsPanel({ uid, mode, onSaved }: ExchangeSettingsProps & { onSaved?: () => void }) {
  const { config, isLoading, setConfig, fetchConfig, updateSetting } = useExchangeConfig(uid);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiSecretInput, setApiSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isTestnet = mode === "testnet";
  const modeColor = isTestnet ? "blue" : "amber";
  const configMatchesMode = config?.configured && config.useTestnet === isTestnet;

  const saveKeys = async () => {
    if (!apiKeyInput || !apiSecretInput) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/binance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, apiKey: apiKeyInput, apiSecret: apiSecretInput, useTestnet: isTestnet }),
      });
      const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
      if (data.success) {
        toast({ title: "Saved", description: `Bybit ${isTestnet ? "testnet" : "production"} credentials validated and saved.` });
        setApiKeyInput("");
        setApiSecretInput("");
        fetchConfig();
        onSaved?.();
      } else {
        toast({ title: "Error", description: data.error || "Failed to save credentials.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!configMatchesMode) {
    return (
      <div className="space-y-4">
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg border",
          isTestnet ? "bg-blue-400/[0.08] border-blue-400/20" : "bg-amber-400/[0.08] border-amber-400/20"
        )}>
          <Shield className={cn("w-5 h-5 shrink-0", isTestnet ? "text-blue-400" : "text-amber-400")} />
          <div>
            <p className={cn("text-sm font-bold", isTestnet ? "text-blue-400" : "text-amber-400")}>
              {isTestnet ? "TESTNET" : "PRODUCTION"} MODE
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isTestnet ? "Fake money. Get keys from testnet.bybit.com" : "Real money. Get keys from bybit.com"}
            </p>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1.5">API Key</label>
          <input
            type="text"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={`Bybit ${isTestnet ? "testnet" : "production"} API key`}
            className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent font-mono"
          />
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1.5">API Secret</label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={apiSecretInput}
              onChange={(e) => setApiSecretInput(e.target.value)}
              placeholder={`Bybit ${isTestnet ? "testnet" : "production"} API secret`}
              className="w-full h-10 px-3 pr-10 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent font-mono"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {!isTestnet && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-400/[0.06] border border-amber-400/15">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-400/80 leading-relaxed">
              Only enable <strong>Contract</strong> trading permission. Never enable withdrawals.
            </p>
          </div>
        )}

        <Button
          onClick={saveKeys}
          disabled={!apiKeyInput || !apiSecretInput || isSaving}
          className={cn(
            "w-full gap-2",
            isTestnet ? "bg-blue-500 text-white hover:bg-blue-500/90" : "bg-amber-500 text-black hover:bg-amber-500/90"
          )}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
          Validate & Save ({isTestnet ? "Testnet" : "Production"})
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Auto-Trade Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
        <div>
          <p className="text-sm font-medium text-foreground">Auto-Trade</p>
          <p className="text-[10px] text-muted-foreground">
            {config.autoTradeEnabled
              ? isTestnet ? "Testnet trading ON (fake money)" : "Live trading ON (real money)"
              : "Trading paused. No orders placed."}
          </p>
        </div>
        <Switch
          checked={config.autoTradeEnabled}
          onCheckedChange={(checked) => {
            if (checked && !isTestnet) {
              if (!confirm("Enable auto-trade with real money?")) return;
            }
            updateSetting("autoTradeEnabled", checked);
          }}
          className={cn(
            isTestnet ? "data-[state=checked]:bg-blue-500" : "data-[state=checked]:bg-positive"
          )}
        />
      </div>

      {/* API Key */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-accent" />
          <div>
            <p className="text-sm font-medium">API Key</p>
            <p className="text-[10px] text-muted-foreground">
              ****{config.keyLastFour} · {config.savedAt ? new Date(config.savedAt).toLocaleDateString() : ""}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-accent"
          onClick={() => setConfig((prev) => prev ? { ...prev, configured: false } : null)}
        >
          Change
        </Button>
      </div>

      {/* Risk Config */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-background/50 border border-white/5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Risk/Trade</p>
          <select
            value={config.riskPerTrade}
            onChange={(e) => updateSetting("riskPerTrade", parseFloat(e.target.value))}
            className="w-full h-8 px-1.5 rounded border border-border bg-background text-xs text-foreground"
          >
            <option value={0.25}>0.25%</option>
            <option value={0.5}>0.5%</option>
            <option value={0.75}>0.75%</option>
            <option value={1}>1%</option>
          </select>
        </div>
        <div className="p-3 rounded-lg bg-background/50 border border-white/5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Max Trades</p>
          <select
            value={config.maxConcurrentTrades}
            onChange={(e) => updateSetting("maxConcurrentTrades", parseInt(e.target.value))}
            className="w-full h-8 px-1.5 rounded border border-border bg-background text-xs text-foreground"
          >
            {[1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="p-3 rounded-lg bg-background/50 border border-white/5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Daily Loss</p>
          <select
            value={config.dailyLossLimit}
            onChange={(e) => updateSetting("dailyLossLimit", parseFloat(e.target.value))}
            className="w-full h-8 px-1.5 rounded border border-border bg-background text-xs text-foreground"
          >
            {[2, 3, 5, 10].map((n) => (
              <option key={n} value={n}>{n}%</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
        Adaptive throttle scales risk {config.riskPerTrade}% → 1% and trades {config.maxConcurrentTrades} → 5 on win streaks. Loss resets to base.
      </p>
    </div>
  );
}

export function ExchangeStatusBadge({ config }: { config: ExchangeConfig | null }) {
  if (!config?.configured) {
    return <Badge variant="secondary" className="text-muted-foreground text-[9px]">Not configured</Badge>;
  }
  if (!config.autoTradeEnabled) {
    return (
      <Badge className="bg-zinc-400/15 text-zinc-400 border-zinc-400/30 text-[9px]">
        <Shield className="h-3 w-3 mr-1" /> Standby
      </Badge>
    );
  }
  if (config.useTestnet) {
    return (
      <Badge className="bg-blue-400/20 text-blue-400 border-blue-400/30 text-[9px]">
        <Shield className="h-3 w-3 mr-1" /> Testnet Active
      </Badge>
    );
  }
  return (
    <Badge className="bg-positive/20 text-positive border-positive/30 text-[9px]">
      <Power className="h-3 w-3 mr-1" /> Live
    </Badge>
  );
}
