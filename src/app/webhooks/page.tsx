
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
import { Plus, Webhook as WebhookIcon, ShieldAlert, Loader2, Send, Lock, Copy, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

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
      secretKey: Math.random().toString(36).substring(2, 15),
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

  const handleTestSignal = async (webhook: any) => {
    setIsTesting(webhook.id);
    const testPayload = {
      ticker: "BTCUSDT",
      side: "BUY",
      secretKey: webhook.secretKey,
      note: "Manual Terminal Test"
    };

    try {
      const response = await fetch(`${webhook.endpointUrl}?id=${webhook.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });
      
      const result = await response.json();

      if (response.ok) {
        toast({ title: "Test Success", description: "Signal broadcasted to global stream." });
      } else {
        toast({ 
          variant: "destructive", 
          title: "Test Failed", 
          description: result.message || "Check API logs." 
        });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Network Error", description: "Could not reach the ingestion node." });
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <LeftSidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Bridge Management</h1>
              <p className="text-muted-foreground text-sm">Configure technical entry points for global alerts.</p>
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

            <Card className="bg-primary/10 border-accent/20">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Info className="h-4 w-4 text-accent" />
                <CardTitle className="text-sm font-bold">TradingView Setup</CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] space-y-3 leading-relaxed text-muted-foreground">
                <p>1. Copy the <b>Endpoint URL</b> into your Alert Webhook box.</p>
                <p>2. Copy the <b>Secret Key</b> into the JSON message body below.</p>
                <p className="text-accent font-bold">IMPORTANT: The "Message" box must ONLY contain the JSON. Remove all other text.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6">
            {isWebhooksLoading ? (
              <div className="h-32 bg-card/50 border border-border animate-pulse rounded-xl" />
            ) : (
              webhooks?.map((webhook) => (
                <Card key={webhook.id} className="bg-card border-border shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-white text-md font-bold">{webhook.name}</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="border-accent/30 hover:bg-accent/10 h-8" onClick={() => handleTestSignal(webhook)} disabled={isTesting === webhook.id}>
                        {isTesting === webhook.id ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Send className="h-3 w-3 mr-2" />} Test
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                          Webhook URL
                          <button onClick={() => copyToClipboard(`${webhook.endpointUrl}?id=${webhook.id}`)} className="text-accent hover:underline flex items-center gap-1">
                            <Copy className="h-2 w-2" /> Copy
                          </button>
                        </Label>
                        <Input readOnly value={`${webhook.endpointUrl}?id=${webhook.id}`} className="bg-secondary/50 font-mono text-xs border-none h-8" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex justify-between">
                          Secret Key
                          <button onClick={() => copyToClipboard(webhook.secretKey)} className="text-accent hover:underline flex items-center gap-1">
                            <Copy className="h-2 w-2" /> Copy
                          </button>
                        </Label>
                        <Input readOnly value={webhook.secretKey} className="bg-secondary/50 font-mono text-xs border-none h-8" />
                      </div>
                    </div>

                    <div className="bg-black/40 rounded-lg p-4 border border-border/50">
                      <Label className="text-[10px] text-accent uppercase tracking-wider font-bold block mb-2">Required TradingView Message (Paste exactly this)</Label>
                      <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap break-all">
{`{
  "ticker": "{{ticker}}",
  "side": "{{strategy.order.action}}",
  "secretKey": "${webhook.secretKey}",
  "note": "TradingView Alert Triggered"
}`}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            {!isWebhooksLoading && webhooks?.length === 0 && (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <p className="text-muted-foreground text-sm">No bridges active. Create one to start receiving signals.</p>
              </div>
            )}
          </div>
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function ChromeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" x2="12" y1="8" y2="8" />
      <line x1="3.95" x2="8.54" y1="6.06" y2="14" />
      <line x1="10.88" x2="15.46" y1="21.94" y2="14" />
    </svg>
  );
}
