
"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser, useFirestore, useAuth } from "@/firebase";
import { collection, query, orderBy, doc, getDoc, getDocs } from "firebase/firestore";
import { addDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Plus, Webhook as WebhookIcon, ShieldAlert, Loader2, Lock, Copy, AlertTriangle, Code, Globe, Zap, ExternalLink, Info, Rocket, CheckCircle2, TrendingUp, TrendingDown, Settings, Activity } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { ChromeIcon } from "@/components/icons";

export default function WebhooksPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newSentimentName, setNewSentimentName] = useState("");
  const [origin, setOrigin] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingSentiment, setIsCreatingSentiment] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const isAdmin = user?.email === "hello@tezterminal.com";

  const [webhooks, setWebhooks] = useState<any[] | null>(null);
  const [isWebhooksLoading, setIsWebhooksLoading] = useState(false);
  useEffect(() => {
    if (!firestore || !isAdmin) return;
    setIsWebhooksLoading(true);
    getDocs(query(collection(firestore, "webhooks"), orderBy("createdAt", "desc")))
      .then(snap => setWebhooks(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .finally(() => setIsWebhooksLoading(false));
  }, [firestore, isAdmin]);

  const [kInput, setKInput] = useState("");

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    getDoc(doc(firestore, "config", "sentiment"))
      .then((snap) => {
        if (snap.exists()) {
          const k = snap.data()?.k;
          if (typeof k === "number" && k > 0) setKInput(String(k));
        }
      })
      .catch(() => {});
  }, [firestore, isAdmin]);

  const handleSaveK = () => {
    if (!firestore || !isAdmin) return;
    const val = parseFloat(kInput);
    if (isNaN(val) || val <= 0 || val > 100) {
      toast({ variant: "destructive", title: "Invalid K", description: "K must be between 0.1 and 100." });
      return;
    }
    const docRef = doc(firestore, "config", "sentiment");
    setDocumentNonBlocking(docRef, { k: val }, { merge: true });
    toast({ title: "Saved", description: `Sentiment decay K updated to ${val}.` });
  };

  const handleAddWebhook = () => {
    if (!user || !newWebhookName.trim() || !firestore || !isAdmin) return;

    setIsCreating(true);
    const webhookData = {
      name: newWebhookName,
      isActive: true,
      secretKey: Math.random().toString(36).substring(2, 11),
      createdAt: new Date().toISOString(),
      endpointUrl: `${origin}/api/webhook`,
    };

    const colRef = collection(firestore, "webhooks");
    addDocumentNonBlocking(colRef, webhookData);
    
    setTimeout(() => {
      setNewWebhookName("");
      setIsCreating(false);
      toast({
        title: "Bridge Created",
        description: `${newWebhookName} is now ready for signals.`,
      });
    }, 500);
  };

  const handleAddSentimentWebhook = () => {
    if (!user || !newSentimentName.trim() || !firestore || !isAdmin) return;

    setIsCreatingSentiment(true);
    const webhookData = {
      name: newSentimentName,
      type: "sentiment",
      isActive: true,
      secretKey: Math.random().toString(36).substring(2, 11),
      createdAt: new Date().toISOString(),
      endpointUrl: `${origin}/api/sentiment-webhook`,
    };

    const colRef = collection(firestore, "webhooks");
    addDocumentNonBlocking(colRef, webhookData);

    setTimeout(() => {
      setNewSentimentName("");
      setIsCreatingSentiment(false);
      toast({
        title: "Sentiment Bridge Created",
        description: `${newSentimentName} is now ready for sentiment data.`,
      });
    }, 500);
  };

  const handleSimulateSentiment = async (webhook: any, sentiment: string) => {
    setIsTesting(`${webhook.id}-sentiment-${sentiment}`);

    const payload = {
      sentiment,
      score: sentiment === "bullish" ? 0.65 : sentiment === "bearish" ? -0.45 : -0.02,
      raw_score: sentiment === "bullish" ? 1 : sentiment === "bearish" ? -1 : 0,
      timeframe: "5",
      algo: "Combined Sentiment (MFI + VIX weighted + %R) [Smoothed]",
      secretKey: webhook.secretKey,
    };

    try {
      const response = await fetch(`${origin}/api/sentiment-webhook?id=${webhook.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Sentiment Simulation Success",
          description: `${sentiment} sentiment signal processed.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Simulation Failed",
          description: result.message || "Check API logs.",
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Network Error", description: "Internal API call failed." });
    } finally {
      setIsTesting(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Value copied to clipboard." });
  };

  const handleSimulateIndicatorSignal = async (webhook: any, side: 'buy' | 'sell', tf: string, testSymbol: string, assetType: string, exchange: string = "BINANCE") => {
    setIsTesting(`${webhook.id}-${side}-${tf}-${assetType}`);
    
    // Generate realistic entry price based on asset type
    let simPrice = 98500.42;
    if (assetType === "INDIAN STOCKS") simPrice = 2450.85;
    if (assetType === "US STOCKS") simPrice = 184.22;
    
    if (side === 'sell') simPrice *= 0.98;

    const indicatorPayload = {
      ticker: testSymbol,
      side: side,
      price: simPrice,
      secretKey: webhook.secretKey,
      exchange: exchange,
      assetType: assetType,
      timeframe: tf, 
      note: `Simulation: Manual ${side.toUpperCase()} ${tf} Signal for ${assetType}`
    };

    try {
      const response = await fetch(`${origin}/api/webhook?id=${webhook.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(indicatorPayload)
      });
      
      const result = await response.json();

      if (response.ok) {
        toast({ 
          title: "Simulation Success", 
          description: `Internal ${side.toUpperCase()} signal for ${testSymbol} processed.` 
        });
      } else {
        toast({ 
          variant: "destructive", 
          title: "Simulation Failed", 
          description: result.message || "Check API logs." 
        });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Network Error", description: "Internal API call failed." });
    } finally {
      setIsTesting(null);
    }
  };

  const handleGoogleLogin = () => {
    if (auth) {
      initiateGoogleSignIn(auth);
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
            <CardTitle>Admin Sign-In</CardTitle>
            <CardDescription>Authenticate to manage global bridge configurations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGoogleLogin} className="w-full h-12 gap-2 bg-white text-black hover:bg-white/90">
              <ChromeIcon className="h-5 w-5" />
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen bg-background flex-col">
        <TopBar />
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-accent/20 bg-card">
            <CardHeader className="text-center">
              <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <CardTitle>Unauthorized Access</CardTitle>
              <CardDescription>Only hello@tezterminal.com can configure global bridges.</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
               <p className="text-sm text-muted-foreground mb-4">Logged in as: {user.email}</p>
               <Button variant="outline" className="w-full" onClick={() => auth && auth.signOut()}>
                 Switch Account
               </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const isWorkstation = origin.includes("workstations.dev") || origin.includes("cloudworkstations.dev");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Bridge Management</h1>
              <p className="text-muted-foreground text-sm">Configure entry points for global TradingView alerts.</p>
            </div>
            <WebhookIcon className="h-8 w-8 text-accent opacity-20" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="bg-secondary/20 border-accent/20 xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Register Global Webhook</CardTitle>
                <CardDescription>Signals sent here will be broadcast to all terminal users.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  <Input 
                    placeholder="e.g. BTC Master RSI Bridge" 
                    value={newWebhookName}
                    onChange={(e) => setNewWebhookName(e.target.value)}
                    className="bg-background border-border flex-1"
                  />
                  <Button onClick={handleAddWebhook} className="bg-accent text-accent-foreground" disabled={isCreating}>
                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create Global Bridge
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className={isWorkstation ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]"}>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                {isWorkstation ? <Info className="h-4 w-4 text-amber-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                <CardTitle className="text-sm font-bold">{isWorkstation ? "Private Preview" : "Public App Live"}</CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] space-y-3 leading-relaxed text-muted-foreground">
                <p>TradingView signals sent to these URLs will flow into the global history feed.</p>
                <div className="pt-2">
                   <Button variant="outline" size="sm" className="w-full text-[10px] h-8 gap-2 bg-background" asChild>
                     <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">
                       <ExternalLink className="h-3 w-3" /> Firebase Console
                     </a>
                   </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-secondary/20 border-accent/20">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Settings className="h-5 w-5 text-accent" />
              <div>
                <CardTitle className="text-lg">Sentiment Engine</CardTitle>
                <CardDescription>Tune the exponential decay constant (K) for market sentiment labels.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Decay Multiplier (K)
                  </Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    placeholder="7"
                    value={kInput}
                    onChange={(e) => setKInput(e.target.value)}
                    className="bg-background border-border w-40 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Lower = faster reaction (noisier). Higher = smoother (slower). Default: 7.
                  </p>
                </div>
                <Button onClick={handleSaveK} className="bg-accent text-accent-foreground h-9">
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-secondary/20 border-purple-500/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-purple-400" />
                <div>
                  <CardTitle className="text-lg">Register Sentiment Webhook</CardTitle>
                  <CardDescription>Receive external sentiment indicator scores (MFI, VIX, %R, etc.).</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4">
                <Input
                  placeholder="e.g. BTC 5m Sentiment Feed"
                  value={newSentimentName}
                  onChange={(e) => setNewSentimentName(e.target.value)}
                  className="bg-background border-border flex-1"
                />
                <Button onClick={handleAddSentimentWebhook} className="bg-purple-600 hover:bg-purple-700 text-white" disabled={isCreatingSentiment}>
                  {isCreatingSentiment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create Sentiment Bridge
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 pb-20">
            {isWebhooksLoading ? (
              <div className="h-32 bg-card/50 border border-border animate-pulse rounded-xl" />
            ) : (
              webhooks?.map((webhook) => {
                const isSentiment = webhook.type === "sentiment";
                const endpoint = isSentiment
                  ? `${origin}/api/sentiment-webhook?id=${webhook.id}`
                  : `${origin}/api/webhook?id=${webhook.id}`;

                return (
                  <Card key={webhook.id} className={`bg-card border-border shadow-md ${isSentiment ? "border-l-2 border-l-purple-500/50" : ""}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-border/50 mb-4 bg-secondary/10">
                      <div className="flex items-center gap-3">
                        {isSentiment && <Activity className="h-4 w-4 text-purple-400" />}
                        <div>
                          <CardTitle className="text-white text-md font-bold">{webhook.name}</CardTitle>
                          <CardDescription className="text-[10px] font-mono">
                            {webhook.id}
                            {isSentiment && <span className="ml-2 text-purple-400 font-semibold uppercase">Sentiment</span>}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2 justify-end">
                          {isSentiment ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 h-7 text-[10px]"
                                onClick={() => handleSimulateSentiment(webhook, "bullish")}
                                disabled={!!isTesting}
                              >
                                {isTesting?.includes("bullish") ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <TrendingUp className="h-3 w-3 mr-2" />} Sim Bullish
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-red-500/30 hover:bg-red-500/10 text-red-400 h-7 text-[10px]"
                                onClick={() => handleSimulateSentiment(webhook, "bearish")}
                                disabled={!!isTesting}
                              >
                                {isTesting?.includes("bearish") ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <TrendingDown className="h-3 w-3 mr-2" />} Sim Bearish
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-gray-500/30 hover:bg-gray-500/10 text-gray-400 h-7 text-[10px]"
                                onClick={() => handleSimulateSentiment(webhook, "neutral")}
                                disabled={!!isTesting}
                              >
                                {isTesting?.includes("neutral") ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Activity className="h-3 w-3 mr-2" />} Sim Neutral
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="border-accent/30 hover:bg-accent/10 text-accent h-7 text-[10px]" 
                                onClick={() => handleSimulateIndicatorSignal(webhook, 'buy', '15', 'BTCUSDT', 'CRYPTO')} 
                                disabled={!!isTesting}
                              >
                                {isTesting?.includes('CRYPTO') ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Zap className="h-3 w-3 mr-2" />} Sim Crypto (BTC)
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 h-7 text-[10px]" 
                                onClick={() => handleSimulateIndicatorSignal(webhook, 'buy', 'Daily', 'RELIANCE', 'INDIAN STOCKS', 'NSE')} 
                                disabled={!!isTesting}
                              >
                                {isTesting?.includes('INDIAN') ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <TrendingUp className="h-3 w-3 mr-2" />} Sim Indian Stock
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="border-blue-500/30 hover:bg-blue-500/10 text-blue-400 h-7 text-[10px]" 
                                onClick={() => handleSimulateIndicatorSignal(webhook, 'sell', '60', 'NVDA', 'US STOCKS', 'NASDAQ')} 
                                disabled={!!isTesting}
                              >
                                {isTesting?.includes('US STOCKS') ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <TrendingDown className="h-3 w-3 mr-2" />} Sim US Stock
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                            Webhook URL
                            <button onClick={() => copyToClipboard(endpoint)} className="text-accent hover:underline flex items-center gap-1">
                              <Copy className="h-2 w-2" /> Copy URL
                            </button>
                          </Label>
                          <Input readOnly value={endpoint} className="bg-secondary/50 font-mono text-xs border-none h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                            Secret Key
                            <button onClick={() => copyToClipboard(webhook.secretKey)} className="text-accent hover:underline flex items-center gap-1">
                              <Copy className="h-2 w-2" /> Copy Key
                            </button>
                          </Label>
                          <Input readOnly value={webhook.secretKey} className="bg-secondary/50 font-mono text-xs border-none h-8" />
                        </div>
                      </div>

                      {isSentiment ? (
                        <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg flex items-start gap-3">
                          <Info className="h-4 w-4 text-purple-400 mt-0.5" />
                          <div className="text-[10px] leading-relaxed text-muted-foreground">
                            <p><b>Sentiment Payload:</b> POST JSON with <code>sentiment</code>, <code>score</code>, <code>raw_score</code>, <code>timeframe</code>, <code>algo</code>.</p>
                            <p className="mt-1">Example: <code>{`{"sentiment":"bullish","score":0.65,"raw_score":1,"timeframe":"5","algo":"Combined Sentiment","secretKey":"<key>"}`}</code></p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg flex items-start gap-3">
                          <Info className="h-4 w-4 text-accent mt-0.5" />
                          <div className="text-[10px] leading-relaxed text-muted-foreground">
                            <p><b>Multi-Market Support:</b> The terminal now filters by Asset Type (Crypto, Indian Stocks, US Stocks).</p>
                            <p className="mt-1">Example Payload for Stocks: <code>{`{"ticker": "RELIANCE", "assetType": "INDIAN STOCKS", "exchange": "NSE"}`}</code></p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
