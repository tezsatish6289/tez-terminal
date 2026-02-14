"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollection, useUser, useMemoFirebase, useFirestore, useAuth } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import { addDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Plus, Webhook as WebhookIcon, ShieldAlert, Loader2, Lock, Copy, AlertTriangle, Code, Globe, Zap, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { ChromeIcon } from "@/components/icons";

export default function WebhooksPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [newWebhookName, setNewWebhookName] = useState("");
  const [origin, setOrigin] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const isAdmin = user?.email === "hello@tezterminal.com";

  const webhooksQuery = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null;
    return query(collection(firestore, "webhooks"), orderBy("createdAt", "desc"));
  }, [firestore, isAdmin]);

  const { data: webhooks, isLoading: isWebhooksLoading } = useCollection(webhooksQuery);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Value copied to clipboard." });
  };

  const handleSimulateIndicatorSignal = async (webhook: any, side: 'buy' | 'sell') => {
    setIsTesting(`${webhook.id}-${side}`);
    
    const indicatorPayload = {
      ticker: "ARCUSDT.P",
      side: side,
      secretKey: webhook.secretKey,
      exchange: "BINANCE",
      timeframe: "1",
      note: `Simulation: Manual ${side.toUpperCase()} Signal`
    };

    try {
      const response = await fetch(`${webhook.endpointUrl}?id=${webhook.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(indicatorPayload)
      });
      
      const result = await response.json();

      if (response.ok) {
        toast({ 
          title: "Simulation Success", 
          description: `Internal ${side.toUpperCase()} signal processed. Check History Page.` 
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
      <div className="flex min-h-screen bg-background">
        <LeftSidebar />
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

  const isWorkstation = origin.includes("cloudworkstations.dev");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <LeftSidebar />
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

            <Card className={isWorkstation ? "bg-rose-500/10 border-rose-500/30" : "bg-emerald-500/10 border-emerald-500/30"}>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                {isWorkstation ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <Globe className="h-4 w-4 text-emerald-400" />}
                <CardTitle className="text-sm font-bold">{isWorkstation ? "Private Dev Node" : "Public Terminal Active"}</CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] space-y-3 leading-relaxed text-muted-foreground">
                {isWorkstation ? (
                  <p>External sites (TradingView) are <b>blocked</b> from this workstation URL. Use the Simulate buttons to verify code logic.</p>
                ) : (
                  <p>Terminal is publicly accessible. TradingView can now hit your webhook endpoints directly.</p>
                )}
                <div className="pt-2">
                   <Button variant="outline" size="sm" className="w-full text-[10px] h-8 gap-2" asChild>
                     <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">
                       <ExternalLink className="h-3 w-3" /> Go to Deployment Console
                     </a>
                   </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 pb-20">
            {isWebhooksLoading ? (
              <div className="h-32 bg-card/50 border border-border animate-pulse rounded-xl" />
            ) : (
              webhooks?.map((webhook) => {
                const pineScriptSnippet = `// Webhook Logic for TezTerminal\nif buySignal\n    alert('{"ticker":"' + syminfo.ticker + '", "side":"buy", "secretKey":"${webhook.secretKey}"}', alert.freq_once_per_bar_close)\nif sellSignal\n    alert('{"ticker":"' + syminfo.ticker + '", "side":"sell", "secretKey":"${webhook.secretKey}"}', alert.freq_once_per_bar_close)`;

                return (
                  <Card key={webhook.id} className="bg-card border-border shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <div>
                        <CardTitle className="text-white text-md font-bold">{webhook.name}</CardTitle>
                        <CardDescription className="text-[10px] font-mono">{webhook.id}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 h-8" 
                          onClick={() => handleSimulateIndicatorSignal(webhook, 'buy')} 
                          disabled={!!isTesting}
                        >
                          {isTesting === `${webhook.id}-buy` ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Zap className="h-3 w-3 mr-2" />} Simulate Buy
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="border-rose-500/30 hover:bg-rose-500/10 text-rose-400 h-8" 
                          onClick={() => handleSimulateIndicatorSignal(webhook, 'sell')} 
                          disabled={!!isTesting}
                        >
                          {isTesting === `${webhook.id}-sell` ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Zap className="h-3 w-3 mr-2" />} Simulate Sell
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                            Webhook URL (Copy to TradingView)
                            <button onClick={() => copyToClipboard(`${webhook.endpointUrl}?id=${webhook.id}`)} className="text-accent hover:underline flex items-center gap-1">
                              <Copy className="h-2 w-2" /> Copy URL
                            </button>
                          </Label>
                          <Input readOnly value={`${webhook.endpointUrl}?id=${webhook.id}`} className="bg-secondary/50 font-mono text-xs border-none h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                            Indicator Secret Key
                            <button onClick={() => copyToClipboard(webhook.secretKey)} className="text-accent hover:underline flex items-center gap-1">
                              <Copy className="h-2 w-2" /> Copy Key
                            </button>
                          </Label>
                          <Input readOnly value={webhook.secretKey} className="bg-secondary/50 font-mono text-xs border-none h-8" />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-black/40 rounded-lg p-4 border border-border/50 relative group">
                           <div className="flex items-center gap-2 mb-3">
                             <Code className="h-4 w-4 text-accent" />
                             <span className="text-[10px] text-accent uppercase font-bold tracking-widest">Pine Script Integration</span>
                           </div>
                           <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap break-all leading-relaxed bg-black/20 p-3 rounded border border-white/5">
{pineScriptSnippet}
                           </pre>
                           <Button 
                              variant="ghost" 
                              size="sm" 
                              className="mt-3 h-7 text-[10px] text-accent border border-accent/20 hover:bg-accent/10 w-full"
                              onClick={() => copyToClipboard(pineScriptSnippet)}
                            >
                              <Copy className="h-3 w-3 mr-2" /> Copy Pine Script Logic
                            </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </main>
      <Toaster />
    </div>
  );
}
