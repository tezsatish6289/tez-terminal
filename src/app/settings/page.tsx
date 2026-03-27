"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { useAuth } from "@/firebase";
import { trackTelegramConnected, trackTelegramEnabled, trackNotificationsPageView } from "@/firebase/analytics";
import {
  Loader2, Settings, Send, Link2, Unlink, Check,
  ChevronLeft, ChevronRight, Bell, Lock, ExternalLink, AlertTriangle,
  Zap, Eye, EyeOff, Shield, Power,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TIMEFRAME_OPTIONS = [
  { value: "5", label: "Scalping (5m)" },
  { value: "15", label: "Intraday (15m)" },
  { value: "60", label: "BTST (1H)" },
  { value: "240", label: "Swing (4H)" },
];

const SIDE_OPTIONS = [
  { value: "BUY", label: "Buy (Long)" },
  { value: "SELL", label: "Sell (Short)" },
];

interface TelegramStatus {
  connected: boolean;
  enabled: boolean;
  username: string | null;
  connectedAt: string | null;
  preferences: {
    enabled: boolean;
    timeframes: string[];
    sides: string[];
    symbols: string[];
  } | null;
}

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();

  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [symbolInput, setSymbolInput] = useState("");

  // Auto-trade state
  const [binanceConfig, setBinanceConfig] = useState<{
    configured: boolean;
    autoTradeEnabled: boolean;
    keyLastFour: string;
    riskPerTrade: number;
    maxConcurrentTrades: number;
    dailyLossLimit: number;
    useTestnet: boolean;
    savedAt: string | null;
  } | null>(null);
  const [isLoadingBinance, setIsLoadingBinance] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiSecretInput, setApiSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSavingBinance, setIsSavingBinance] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/telegram/status?uid=${user.uid}`);
      const data = await res.json();
      setStatus(data);
    } catch {
      console.error("Failed to fetch Telegram status");
    } finally {
      setIsLoadingStatus(false);
    }
  }, [user]);

  const fetchBinanceConfig = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/settings/binance?uid=${user.uid}`);
      const data = await res.json();
      setBinanceConfig(data);
    } catch {
      console.error("Failed to fetch Bybit config");
    } finally {
      setIsLoadingBinance(false);
    }
  }, [user]);

  useEffect(() => { trackNotificationsPageView(); }, []);

  useEffect(() => {
    if (user) {
      fetchStatus();
      fetchBinanceConfig();
    }
  }, [user, fetchStatus, fetchBinanceConfig]);

  const [deepLink, setDeepLink] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!user) return;
    setIsConnecting(true);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firebaseUid: user.uid }),
      });
      const data = await res.json();
      if (data.deepLink) {
        setDeepLink(data.deepLink);
        trackTelegramConnected();
        toast({
          title: "Link generated!",
          description: "Click the link below to open Telegram and complete the connection.",
        });
      } else {
        toast({ title: "Error", description: data.error || "Failed to generate link.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate link. Please try again.", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const updatePreference = async (field: string, value: any) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await fetch("/api/telegram/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firebaseUid: user.uid,
          preferences: { [field]: value },
        }),
      });
      setStatus(prev => prev ? {
        ...prev,
        preferences: prev.preferences ? { ...prev.preferences, [field]: value } : null,
      } : null);
      toast({ title: "Saved", description: "Preference updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFilter = (field: string, value: string, currentValues: string[], allOptions: string[]) => {
    let updated: string[];

    if (value === "ALL") {
      updated = currentValues.includes("ALL") ? [] : ["ALL"];
    } else {
      if (currentValues.includes("ALL")) {
        updated = allOptions.filter(o => o !== value);
      } else if (currentValues.includes(value)) {
        updated = currentValues.filter(v => v !== value);
      } else {
        updated = [...currentValues, value];
      }
      if (updated.length === allOptions.length) {
        updated = ["ALL"];
      }
    }

    if (updated.length === 0) updated = ["ALL"];
    updatePreference(field, updated);
  };

  const addSymbol = () => {
    const sym = symbolInput.trim().toUpperCase();
    if (!sym || !status?.preferences) return;
    const current = status.preferences.symbols || [];
    if (current.includes(sym)) return;
    updatePreference("symbols", [...current, sym]);
    setSymbolInput("");
  };

  const removeSymbol = (sym: string) => {
    if (!status?.preferences) return;
    const updated = (status.preferences.symbols || []).filter(s => s !== sym);
    updatePreference("symbols", updated);
  };

  const isSelected = (values: string[], value: string) => {
    if (values.includes("ALL")) return true;
    return values.includes(value);
  };

  const saveBinanceKeys = async () => {
    if (!user || !apiKeyInput || !apiSecretInput) return;
    setIsSavingBinance(true);
    try {
      const res = await fetch("/api/settings/binance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, apiKey: apiKeyInput, apiSecret: apiSecretInput }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Saved", description: "Bybit API credentials validated and saved." });
        setApiKeyInput("");
        setApiSecretInput("");
        fetchBinanceConfig();
      } else {
        toast({ title: "Error", description: data.error || "Failed to save credentials.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
    } finally {
      setIsSavingBinance(false);
    }
  };

  const updateBinanceSetting = async (field: string, value: unknown) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/binance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, [field]: value }),
      });
      const data = await res.json();
      if (data.success) {
        setBinanceConfig((prev) => prev ? { ...prev, [field]: value } : null);
        toast({ title: "Saved", description: `${field === "autoTradeEnabled" ? "Auto-trade" : field} updated.` });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 text-accent mx-auto mb-4" />
            <CardTitle>Sign-In Required</CardTitle>
            <CardDescription>Sign in to manage your alert settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => initiateGoogleSignIn(auth)}
              className="w-full h-12 gap-2 bg-white text-black hover:bg-white/90"
            >
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const prefs = status?.preferences;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/signals"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Link>
              <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
              <p className="text-muted-foreground text-sm">Manage auto-trading, alerts, and preferences.</p>
            </div>
            <Settings className="h-8 w-8 text-accent opacity-20" />
          </div>

          {/* Auto-Trade (Binance) Section */}
          <Card className="bg-secondary/20 border-accent/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-accent" />
                  <div>
                    <CardTitle className="text-lg">Auto-Trade · Bybit Futures</CardTitle>
                    <CardDescription>
                      Automatically execute trades on Bybit based on simulator decisions.
                    </CardDescription>
                  </div>
                </div>
                {binanceConfig?.configured ? (
                  <Badge className={cn(
                    binanceConfig.autoTradeEnabled
                      ? "bg-positive/20 text-positive border-positive/30"
                      : "bg-amber-400/15 text-amber-400 border-amber-400/30"
                  )}>
                    {binanceConfig.autoTradeEnabled ? (
                      <><Power className="h-3 w-3 mr-1" /> Live</>
                    ) : (
                      <><Shield className="h-3 w-3 mr-1" /> Standby</>
                    )}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-muted-foreground">Not configured</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingBinance ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              ) : binanceConfig?.configured ? (
                <div className="space-y-4">
                  {/* Kill Switch */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
                    <div>
                      <p className="text-sm font-medium text-foreground">Auto-Trade Enabled</p>
                      <p className="text-[10px] text-muted-foreground">
                        {binanceConfig.autoTradeEnabled
                          ? "Live trading is ON. Trades will execute on Bybit."
                          : "Trading paused. Simulator runs but no real orders."}
                      </p>
                    </div>
                    <Switch
                      checked={binanceConfig.autoTradeEnabled}
                      onCheckedChange={(checked) => updateBinanceSetting("autoTradeEnabled", checked)}
                      className="data-[state=checked]:bg-positive"
                    />
                  </div>

                  {/* Testnet Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
                    <div>
                      <p className="text-sm font-medium text-foreground">Testnet Mode</p>
                      <p className="text-[10px] text-muted-foreground">
                        {binanceConfig.useTestnet ? "Using Bybit testnet (fake money)." : "Using PRODUCTION Bybit (real money)."}
                      </p>
                    </div>
                    <Switch
                      checked={binanceConfig.useTestnet}
                      onCheckedChange={(checked) => updateBinanceSetting("useTestnet", checked)}
                      className="data-[state=checked]:bg-accent"
                    />
                  </div>

                  {!binanceConfig.useTestnet && binanceConfig.autoTradeEnabled && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-400/[0.06] border border-rose-400/15">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-rose-400/80 leading-relaxed">
                        Live trading with real money is active. Ensure you understand the risks. Use the kill switch above to stop all trading immediately.
                      </p>
                    </div>
                  )}

                  {/* API Key Info */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
                    <div className="flex items-center gap-3">
                      <Shield className="h-4 w-4 text-accent" />
                      <div>
                        <p className="text-sm font-medium text-foreground">API Key</p>
                        <p className="text-[10px] text-muted-foreground">
                          Ending in ****{binanceConfig.keyLastFour} · Saved {binanceConfig.savedAt ? new Date(binanceConfig.savedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-accent"
                      onClick={() => {
                        setBinanceConfig((prev) => prev ? { ...prev, configured: false } : null);
                      }}
                    >
                      Change Keys
                    </Button>
                  </div>

                  {/* Risk Config */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-background/50 border border-white/5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Risk Per Trade</p>
                      <p className="text-[9px] text-muted-foreground/40 mb-2">Base risk. Scales to 1% on win streaks.</p>
                      <select
                        value={binanceConfig.riskPerTrade}
                        onChange={(e) => updateBinanceSetting("riskPerTrade", parseFloat(e.target.value))}
                        className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm text-foreground"
                      >
                        <option value={0.25}>0.25%</option>
                        <option value={0.5}>0.5% ← suggested</option>
                        <option value={0.75}>0.75%</option>
                        <option value={1}>1%</option>
                      </select>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50 border border-white/5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Max Concurrent</p>
                      <p className="text-[9px] text-muted-foreground/40 mb-2">Starts here, scales up on win streaks (cap 5).</p>
                      <select
                        value={binanceConfig.maxConcurrentTrades}
                        onChange={(e) => updateBinanceSetting("maxConcurrentTrades", parseInt(e.target.value))}
                        className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm text-foreground"
                      >
                        {[1, 2, 3, 5].map((n) => (
                          <option key={n} value={n}>{n} trade{n > 1 ? "s" : ""}{n === 1 ? " ← suggested" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50 border border-white/5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Daily Loss Limit</p>
                      <p className="text-[9px] text-muted-foreground/40 mb-2">Safety net. Disables trading for the day.</p>
                      <select
                        value={binanceConfig.dailyLossLimit}
                        onChange={(e) => updateBinanceSetting("dailyLossLimit", parseFloat(e.target.value))}
                        className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm text-foreground"
                      >
                        {[2, 3, 5, 10].map((n) => (
                          <option key={n} value={n}>{n}%{n === 5 ? " ← suggested" : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/[0.04] border border-accent/10">
                    <Shield className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      The adaptive throttle system manages these dynamically: risk scales from {binanceConfig.riskPerTrade}% → 1% on win streaks, concurrent trades scale from {binanceConfig.maxConcurrentTrades} → 5 on consecutive wins. A single loss resets both to base values. These are hard caps on top of that.
                    </p>
                  </div>
                </div>
              ) : (
                /* API Key Entry Form */
                <div className="space-y-4">
                  <div className="text-center py-2">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 border border-accent/20 mb-3">
                      <Zap className="h-8 w-8 text-accent" />
                    </div>
                    <p className="text-sm text-foreground font-medium">Connect your Bybit account</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      API keys are encrypted with AES-256 and stored server-side only.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1.5">API Key</label>
                    <input
                      type="text"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="Enter your Bybit API key"
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
                        placeholder="Enter your Bybit API secret"
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

                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-400/[0.06] border border-amber-400/15">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-400/80 leading-relaxed">
                      Only enable <strong>Contract</strong> trading permission on your API key. Never enable withdrawals. Your credentials will be validated against Bybit before saving.
                    </p>
                  </div>

                  <Button
                    onClick={saveBinanceKeys}
                    disabled={!apiKeyInput || !apiSecretInput || isSavingBinance}
                    className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {isSavingBinance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    Validate & Save
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Telegram Connection Card */}
          <Card className="bg-secondary/20 border-accent/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Send className="h-5 w-5 text-accent" />
                  <div>
                    <CardTitle className="text-lg">Telegram</CardTitle>
                    <CardDescription>
                      Receive real-time trade alerts directly in Telegram.
                    </CardDescription>
                  </div>
                </div>
                {status?.connected ? (
                  <Badge className="bg-positive/20 text-positive border-positive/30">
                    <Check className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-muted-foreground">
                    Not connected
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingStatus ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              ) : status?.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
                    <div className="flex items-center gap-3">
                      <Send className="h-4 w-4 text-accent" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          @{status.username || "Connected"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Connected {status.connectedAt ? new Date(status.connectedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive text-xs gap-1.5"
                      onClick={() => {
                        toast({ title: "To disconnect", description: "Send /stop to @TezTerminalBot in Telegram." });
                      }}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5">
                    <div>
                      <p className="text-sm font-medium text-foreground">Alerts Enabled</p>
                      <p className="text-[10px] text-muted-foreground">Receive trade notifications on Telegram</p>
                    </div>
                    <Switch
                      checked={status.enabled}
                      onCheckedChange={(checked) => {
                        updatePreference("enabled", checked);
                        setStatus(prev => prev ? { ...prev, enabled: checked } : null);
                        if (checked) trackTelegramEnabled();
                      }}
                      className="data-[state=checked]:bg-accent"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 space-y-4">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 border border-accent/20">
                    <Send className="h-8 w-8 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground font-medium">Connect your Telegram account</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Get alerts for new signals, TP hits, and stop losses directly in Telegram.
                    </p>
                  </div>
                  {deepLink ? (
                    <div className="space-y-3">
                      <a
                        href={deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open @TezTerminalBot
                      </a>
                      <p className="text-[10px] text-muted-foreground">
                        Tap <strong>START</strong> in Telegram, then come back here and refresh the page.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchStatus()}
                        className="text-xs text-accent"
                      >
                        I&apos;ve connected — Refresh status
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                      >
                        {isConnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                        Connect Telegram
                      </Button>
                      <p className="text-[10px] text-muted-foreground">
                        Generates a link to @TezTerminalBot. Tap START to connect.
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preferences — only show when connected */}
          {status?.connected && prefs && (
            <>
              {/* Timeframes */}
              <Card className="bg-secondary/20 border-accent/20">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-4 w-4 text-accent" />
                    Top Pick Alert Preferences
                  </CardTitle>
                  <CardDescription>Choose which Top Pick alerts you receive on Telegram. You'll get full signal details with entry, targets, and stop loss.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Timeframes */}
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-3">Timeframes</p>
                    <div className="flex flex-wrap gap-2">
                      <FilterChip
                        label="All"
                        active={prefs.timeframes.includes("ALL")}
                        onClick={() => toggleFilter("timeframes", "ALL", prefs.timeframes, TIMEFRAME_OPTIONS.map(o => o.value))}
                      />
                      {TIMEFRAME_OPTIONS.map(opt => (
                        <FilterChip
                          key={opt.value}
                          label={opt.label}
                          active={isSelected(prefs.timeframes, opt.value)}
                          onClick={() => toggleFilter("timeframes", opt.value, prefs.timeframes, TIMEFRAME_OPTIONS.map(o => o.value))}
                        />
                      ))}
                    </div>
                    {(isSelected(prefs.timeframes, "5")) && (
                      <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-amber-400/[0.06] border border-amber-400/15">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-400/80 leading-relaxed">
                          Scalping (5m) generates a high volume of alerts and can be noisy. Consider disabling it unless you actively trade scalping setups.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Sides */}
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-3">Trade Side</p>
                    <div className="flex flex-wrap gap-2">
                      <FilterChip
                        label="Both"
                        active={prefs.sides.includes("ALL")}
                        onClick={() => toggleFilter("sides", "ALL", prefs.sides, SIDE_OPTIONS.map(o => o.value))}
                      />
                      {SIDE_OPTIONS.map(opt => (
                        <FilterChip
                          key={opt.value}
                          label={opt.label}
                          active={isSelected(prefs.sides, opt.value)}
                          onClick={() => toggleFilter("sides", opt.value, prefs.sides, SIDE_OPTIONS.map(o => o.value))}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Symbol Watchlist */}
              <Card className="bg-secondary/20 border-accent/20">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-accent" />
                    Symbol Watchlist
                  </CardTitle>
                  <CardDescription>
                    Only receive alerts for specific symbols. Leave empty to receive all.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={symbolInput}
                      onChange={e => setSymbolInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSymbol()}
                      placeholder="e.g. BTCUSDT, NIFTY"
                      className="flex-1 h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <Button
                      onClick={addSymbol}
                      disabled={!symbolInput.trim()}
                      size="sm"
                      className="h-10 px-4 bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      Add
                    </Button>
                  </div>

                  {prefs.symbols.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {prefs.symbols.map(sym => (
                        <Badge
                          key={sym}
                          className="bg-accent/10 text-accent border-accent/20 gap-1.5 cursor-pointer hover:bg-destructive/20 hover:text-destructive hover:border-destructive/20 transition-colors"
                          onClick={() => removeSymbol(sym)}
                        >
                          {sym}
                          <span className="text-[10px] opacity-60">×</span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">
                      No symbols added — you&apos;ll receive alerts for all symbols.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Bot Commands Reference */}
              <Card className="bg-secondary/20 border-accent/20">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-accent" />
                    Telegram Bot Commands
                  </CardTitle>
                  <CardDescription>
                    You can also manage alerts directly inside Telegram.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {[
                      { cmd: "/settings", desc: "Change alert preferences" },
                      { cmd: "/status", desc: "View your current settings" },
                      { cmd: "/stop", desc: "Pause all alerts" },
                      { cmd: "/resume", desc: "Resume alerts" },
                      { cmd: "/help", desc: "Show all commands" },
                    ].map(item => (
                      <div key={item.cmd} className="flex items-center gap-3 p-2 rounded-md bg-background/50">
                        <code className="text-xs font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">{item.cmd}</code>
                        <span className="text-xs text-muted-foreground">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {isSaving && (
            <div className="fixed bottom-6 right-6 bg-card border border-accent/20 rounded-lg px-4 py-2 shadow-2xl flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-xs text-muted-foreground">Saving...</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
        active
          ? "bg-accent/20 text-accent border-accent/30"
          : "bg-background/50 text-muted-foreground border-white/5 hover:border-accent/20 hover:text-foreground"
      )}
    >
      {active && <Check className="inline h-3 w-3 mr-1" />}
      {label}
    </button>
  );
}
