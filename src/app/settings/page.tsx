"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { useAuth } from "@/firebase";
import {
  Loader2, Settings, Send, Link2, Unlink, Check,
  ChevronRight, Bell, Lock, ExternalLink,
} from "lucide-react";
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
  { value: "D", label: "Positional (D)" },
];

const ASSET_TYPE_OPTIONS = [
  { value: "CRYPTO", label: "Crypto" },
  { value: "INDIAN STOCKS", label: "Indian Stocks" },
  { value: "US STOCKS", label: "US Stocks" },
];

const SIDE_OPTIONS = [
  { value: "BUY", label: "Buy (Long)" },
  { value: "SELL", label: "Sell (Short)" },
];

const ALERT_TYPE_OPTIONS = [
  { value: "NEW_SIGNAL", label: "New Signals" },
  { value: "TP1_HIT", label: "TP1 Hit" },
  { value: "TP2_HIT", label: "TP2 Hit" },
  { value: "TP3_HIT", label: "TP3 Hit" },
  { value: "SL_HIT", label: "SL Hit" },
];

interface TelegramStatus {
  connected: boolean;
  enabled: boolean;
  username: string | null;
  connectedAt: string | null;
  preferences: {
    enabled: boolean;
    alertTypes: string[];
    timeframes: string[];
    assetTypes: string[];
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

  useEffect(() => {
    if (user) fetchStatus();
  }, [user, fetchStatus]);

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
        window.open(data.deepLink, "_blank");
        toast({
          title: "Opening Telegram",
          description: "Tap START in the bot to complete the connection. Then come back here and refresh.",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate link.", variant: "destructive" });
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

  const isSelected = (values: string[], value: string, allOptions: string[]) => {
    if (values.includes("ALL")) return true;
    return values.includes(value);
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
              <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
              <p className="text-muted-foreground text-sm">Manage your Telegram alerts and preferences.</p>
            </div>
            <Settings className="h-8 w-8 text-accent opacity-20" />
          </div>

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
                    Opens @TezTerminalBot in Telegram. Tap START to connect.
                  </p>
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
                    Alert Preferences
                  </CardTitle>
                  <CardDescription>Choose which alerts you receive on Telegram.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Alert Types */}
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-3">Alert Types</p>
                    <div className="flex flex-wrap gap-2">
                      <FilterChip
                        label="All"
                        active={prefs.alertTypes.includes("ALL")}
                        onClick={() => toggleFilter("alertTypes", "ALL", prefs.alertTypes, ALERT_TYPE_OPTIONS.map(o => o.value))}
                      />
                      {ALERT_TYPE_OPTIONS.map(opt => (
                        <FilterChip
                          key={opt.value}
                          label={opt.label}
                          active={isSelected(prefs.alertTypes, opt.value, ALERT_TYPE_OPTIONS.map(o => o.value))}
                          onClick={() => toggleFilter("alertTypes", opt.value, prefs.alertTypes, ALERT_TYPE_OPTIONS.map(o => o.value))}
                        />
                      ))}
                    </div>
                  </div>

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
                          active={isSelected(prefs.timeframes, opt.value, TIMEFRAME_OPTIONS.map(o => o.value))}
                          onClick={() => toggleFilter("timeframes", opt.value, prefs.timeframes, TIMEFRAME_OPTIONS.map(o => o.value))}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Asset Types */}
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-3">Asset Types</p>
                    <div className="flex flex-wrap gap-2">
                      <FilterChip
                        label="All"
                        active={prefs.assetTypes.includes("ALL")}
                        onClick={() => toggleFilter("assetTypes", "ALL", prefs.assetTypes, ASSET_TYPE_OPTIONS.map(o => o.value))}
                      />
                      {ASSET_TYPE_OPTIONS.map(opt => (
                        <FilterChip
                          key={opt.value}
                          label={opt.label}
                          active={isSelected(prefs.assetTypes, opt.value, ASSET_TYPE_OPTIONS.map(o => o.value))}
                          onClick={() => toggleFilter("assetTypes", opt.value, prefs.assetTypes, ASSET_TYPE_OPTIONS.map(o => o.value))}
                        />
                      ))}
                    </div>
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
                          active={isSelected(prefs.sides, opt.value, SIDE_OPTIONS.map(o => o.value))}
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
