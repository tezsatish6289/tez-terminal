"use client";

import { useState, useEffect, useCallback, type SVGProps, type ReactNode } from "react";
import {
  Loader2, Zap, Eye, EyeOff, Shield, Power, AlertTriangle, Settings, Check, X, Trash2,
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
import { BinanceIcon, MexcIcon, BybitIcon } from "@/components/icons/exchange-icons";

// ── Exchange Definitions ────────────────────────────────────────

type ExchangeId = "BYBIT" | "BINANCE" | "MEXC";

interface ExchangeMeta {
  id: ExchangeId;
  name: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  testnetUrl: string;
  prodUrl: string;
  permissionNote: string;
}

const EXCHANGES: ExchangeMeta[] = [
  {
    id: "BYBIT",
    name: "Bybit",
    icon: BybitIcon,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
    borderColor: "border-amber-400/20",
    testnetUrl: "testnet.bybit.com",
    prodUrl: "bybit.com",
    permissionNote: "Only enable Contract trading permission. Never enable withdrawals.",
  },
  {
    id: "BINANCE",
    name: "Binance",
    icon: BinanceIcon,
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    borderColor: "border-yellow-400/20",
    testnetUrl: "testnet.binancefuture.com",
    prodUrl: "binance.com",
    permissionNote: "Enable Futures trading only. Restrict to IP if possible. Never enable withdrawals.",
  },
  {
    id: "MEXC",
    name: "MEXC",
    icon: MexcIcon,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
    borderColor: "border-emerald-400/20",
    testnetUrl: "",
    prodUrl: "mexc.com",
    permissionNote: "Enable Contract trading permission only. Never enable withdrawals.",
  },
];

function getExchangeMeta(id: ExchangeId): ExchangeMeta {
  return EXCHANGES.find((e) => e.id === id) ?? EXCHANGES[0];
}

// ── Types ───────────────────────────────────────────────────────

export interface ExchangeConfig {
  configured: boolean;
  autoTradeEnabled: boolean;
  keyLastFour: string;
  riskPerTrade: number;
  maxConcurrentTrades: number;
  dailyLossLimit: number;
  useTestnet: boolean;
  savedAt: string | null;
  exchange?: ExchangeId;
}

interface ExchangeSettingsProps {
  uid: string;
  mode: "testnet" | "production";
}

// ── Hook: Per-Exchange Config ───────────────────────────────────

export function useExchangeConfig(uid: string | undefined, exchange: ExchangeId = "BYBIT") {
  const [config, setConfig] = useState<ExchangeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!uid) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/settings/binance?uid=${uid}&exchange=${exchange}`);
      const data = await res.json();
      setConfig({ ...data, exchange });
    } catch {
      console.error("Failed to fetch exchange config");
    } finally {
      setIsLoading(false);
    }
  }, [uid, exchange]);

  useEffect(() => {
    if (uid) fetchConfig();
  }, [uid, fetchConfig]);

  const updateSetting = async (field: string, value: unknown) => {
    if (!uid) return;
    try {
      const res = await fetch("/api/settings/binance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, exchange, [field]: value }),
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

// ── Multi-Exchange Settings Dialog ──────────────────────────────

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
              Exchange Settings
            </DialogTitle>
          </DialogHeader>
          <MultiExchangePanel uid={uid} mode={mode} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Multi-Exchange Panel (Tabbed) ───────────────────────────────

function MultiExchangePanel({ uid, mode, onSaved }: ExchangeSettingsProps & { onSaved?: () => void }) {
  const [activeExchange, setActiveExchange] = useState<ExchangeId>("BYBIT");

  return (
    <div className="space-y-4">
      {/* Exchange Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-background/50 border border-white/5">
        {EXCHANGES.map((ex) => {
          const isActive = activeExchange === ex.id;
          const Icon = ex.icon;
          return (
            <button
              key={ex.id}
              onClick={() => setActiveExchange(ex.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all",
                isActive
                  ? `${ex.bgColor} ${ex.color} ${ex.borderColor} border`
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {ex.name}
            </button>
          );
        })}
      </div>

      {/* Active Exchange Settings */}
      <ExchangeSettingsPanel
        key={activeExchange}
        uid={uid}
        mode={mode}
        exchange={activeExchange}
        onSaved={onSaved}
      />
    </div>
  );
}

// ── Single Exchange Settings Panel ──────────────────────────────

function ExchangeSettingsPanel({
  uid, mode, exchange, onSaved,
}: ExchangeSettingsProps & { exchange: ExchangeId; onSaved?: () => void }) {
  const { config, isLoading, setConfig, fetchConfig, updateSetting } = useExchangeConfig(uid, exchange);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiSecretInput, setApiSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const meta = getExchangeMeta(exchange);

  const deleteCredentials = async () => {
    if (!confirm(`Remove ${meta.name} credentials? This will disable auto-trade on ${meta.name}.`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/settings/binance?uid=${uid}&exchange=${exchange}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
      if (data.success) {
        toast({ title: "Removed", description: `${meta.name} credentials deleted.` });
        fetchConfig();
      } else {
        toast({ title: "Error", description: data.error || "Failed to delete.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to delete.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };
  const isTestnet = mode === "testnet";
  const configMatchesMode = config?.configured && config.useTestnet === isTestnet;

  // MEXC doesn't have a testnet
  const noTestnet = exchange === "MEXC" && isTestnet;

  const saveKeys = async () => {
    if (!apiKeyInput || !apiSecretInput) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/binance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          apiKey: apiKeyInput,
          apiSecret: apiSecretInput,
          useTestnet: isTestnet,
          exchange,
        }),
      });
      const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
      if (data.success) {
        toast({
          title: "Saved",
          description: `${meta.name} ${isTestnet ? "testnet" : "production"} credentials validated and saved.`,
        });
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

  if (noTestnet) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <X className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          {meta.name} does not offer a testnet for futures trading.
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          Switch to production mode to connect your {meta.name} account.
        </p>
      </div>
    );
  }

  if (!configMatchesMode) {
    const Icon = meta.icon;
    return (
      <div className="space-y-4">
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg border",
          meta.bgColor, meta.borderColor
        )}>
          <Icon className="w-5 h-5 shrink-0" />
          <div>
            <p className={cn("text-sm font-bold", meta.color)}>
              {meta.name} {isTestnet ? "TESTNET" : "PRODUCTION"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isTestnet
                ? `Fake money. Get keys from ${meta.testnetUrl}`
                : `Real money. Get keys from ${meta.prodUrl}`}
            </p>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1.5">API Key</label>
          <input
            type="text"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={`${meta.name} ${isTestnet ? "testnet" : "production"} API key`}
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
              placeholder={`${meta.name} ${isTestnet ? "testnet" : "production"} API secret`}
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
          <div className={cn(
            "flex items-start gap-2 p-2.5 rounded-lg border",
            meta.bgColor, meta.borderColor
          )}>
            <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", meta.color)} />
            <p className={cn("text-[11px] leading-relaxed", meta.color)}>
              {meta.permissionNote}
            </p>
          </div>
        )}

        <Button
          onClick={saveKeys}
          disabled={!apiKeyInput || !apiSecretInput || isSaving}
          className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
          Validate & Save ({meta.name} {isTestnet ? "Testnet" : "Production"})
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Auto-Trade Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
        <div>
          <p className="text-sm font-medium text-foreground">Auto-Trade on {meta.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {config.autoTradeEnabled
              ? isTestnet ? `${meta.name} testnet trading ON (fake money)` : `${meta.name} live trading ON (real money)`
              : `Trading paused on ${meta.name}. No orders placed.`}
          </p>
        </div>
        <Switch
          checked={config.autoTradeEnabled}
          onCheckedChange={(checked) => {
            if (checked && !isTestnet) {
              if (!confirm(`Enable auto-trade with real money on ${meta.name}?`)) return;
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
            <p className="text-sm font-medium">{meta.name} API Key</p>
            <p className="text-[10px] text-muted-foreground">
              ****{config.keyLastFour} · {config.savedAt ? new Date(config.savedAt).toLocaleDateString() : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-accent"
            onClick={() => setConfig((prev) => prev ? { ...prev, configured: false } : null)}
          >
            Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-rose-400"
            onClick={deleteCredentials}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </Button>
        </div>
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

// ── Status Badge ────────────────────────────────────────────────

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

// ── Multi-Exchange Status Summary ───────────────────────────────

export function MultiExchangeStatusBadges({ uid }: { uid: string | undefined }) {
  const bybit = useExchangeConfig(uid, "BYBIT");
  const binance = useExchangeConfig(uid, "BINANCE");
  const mexc = useExchangeConfig(uid, "MEXC");

  const configs = [
    { exchange: "BYBIT" as ExchangeId, config: bybit.config, loading: bybit.isLoading },
    { exchange: "BINANCE" as ExchangeId, config: binance.config, loading: binance.isLoading },
    { exchange: "MEXC" as ExchangeId, config: mexc.config, loading: mexc.isLoading },
  ];

  const activeConfigs = configs.filter((c) => c.config?.configured);
  if (activeConfigs.length === 0) return <ExchangeStatusBadge config={null} />;

  return (
    <div className="flex items-center gap-1.5">
      {activeConfigs.map(({ exchange, config }) => {
        const meta = getExchangeMeta(exchange);
        const Icon = meta.icon;

        if (!config?.autoTradeEnabled) {
          return (
            <Badge key={exchange} className="bg-zinc-400/15 text-zinc-400 border-zinc-400/30 text-[9px] gap-1">
              <Icon className="h-3 w-3" /> Standby
            </Badge>
          );
        }

        if (config.useTestnet) {
          return (
            <Badge key={exchange} className="bg-blue-400/20 text-blue-400 border-blue-400/30 text-[9px] gap-1">
              <Icon className="h-3 w-3" /> Test
            </Badge>
          );
        }

        return (
          <Badge key={exchange} className="bg-positive/20 text-positive border-positive/30 text-[9px] gap-1">
            <Icon className="h-3 w-3" />
            <Check className="h-2.5 w-2.5" />
          </Badge>
        );
      })}
    </div>
  );
}
