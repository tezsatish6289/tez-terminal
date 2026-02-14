"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollection, useUser, useMemoFirebase, useFirestore, useAuth, initiateAnonymousSignIn } from "@/firebase";
import { collection } from "firebase/firestore";
import { addDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Copy, Plus, Webhook as WebhookIcon, ShieldCheck, Check, Loader2, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

export default function WebhooksPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [newWebhookName, setNewWebhookName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!isUserLoading && !user && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  const webhooksQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, "users", user.uid, "webhookConfigurations");
  }, [user, firestore]);

  const { data: webhooks, isLoading: isWebhooksLoading } = useCollection(webhooksQuery);

  const handleAddWebhook = () => {
    if (!user || !newWebhookName.trim() || !firestore) return;

    setIsCreating(true);
    const webhookData = {
      name: newWebhookName,
      userId: user.uid,
      isActive: true,
      secretKey: Math.random().toString(36).substring(2, 15),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endpointUrl: `${origin}/api/webhook`,
    };

    const colRef = collection(firestore, "users", user.uid, "webhookConfigurations");
    addDocumentNonBlocking(colRef, webhookData);
    
    setTimeout(() => {
      setNewWebhookName("");
      setIsCreating(false);
      toast({
        title: "Webhook Created",
        description: `Configuration for "${newWebhookName}" has been saved.`,
      });
    }, 500);
  };

  const handleTestSignal = async (webhook: any) => {
    if (!user) return;
    setIsTesting(webhook.id);
    
    const testPayload = {
      symbol: "BTCUSDT",
      type: "BUY",
      price: "98432.50",
      secretKey: webhook.secretKey,
      note: "Manual Test Signal from TezTerminal UI"
    };

    try {
      const response = await fetch(`${webhook.endpointUrl}?id=${webhook.id}&uid=${user.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Test Successful",
          description: "Signal accepted by endpoint. Check history.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Test Failed",
          description: result.message || "Failed to deliver signal.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Network Error",
        description: "Could not reach the webhook endpoint.",
      });
    } finally {
      setIsTesting(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: "Copied!",
        description: "Value copied to clipboard.",
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <LeftSidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Webhook Configurations</h1>
              <p className="text-muted-foreground text-sm">Manage your TradingView alert endpoints.</p>
            </div>
            <WebhookIcon className="h-8 w-8 text-accent opacity-20" />
          </div>

          <Card className="bg-secondary/20 border-accent/20">
            <CardHeader>
              <CardTitle className="text-lg">Create New Webhook</CardTitle>
              <CardDescription>Include the Secret Key in your JSON payload for secure validation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="webhook-name">Configuration Name</Label>
                  <Input 
                    id="webhook-name" 
                    placeholder="e.g. BTC 15m RSI Strategy" 
                    value={newWebhookName}
                    onChange={(e) => setNewWebhookName(e.target.value)}
                    className="bg-background border-border"
                    disabled={isUserLoading || isCreating}
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleAddWebhook}
                    disabled={!newWebhookName.trim() || isUserLoading || isCreating}
                    className="bg-accent text-accent-foreground w-full md:w-auto"
                  >
                    {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create Webhook
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            {(isWebhooksLoading || isUserLoading) ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <div key={i} className="h-32 bg-card/50 border border-border animate-pulse rounded-xl" />)}
              </div>
            ) : webhooks?.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <p className="text-muted-foreground">No webhook configurations found.</p>
              </div>
            ) : (
              webhooks?.map((webhook) => {
                const fullUrl = `${webhook.endpointUrl}?id=${webhook.id}&uid=${user?.uid}`;
                return (
                  <Card key={webhook.id} className="bg-card border-border overflow-hidden group">
                    <div className="h-1 w-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <div>
                        <CardTitle className="text-white flex items-center gap-2">
                          {webhook.name}
                          {webhook.isActive && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                        </CardTitle>
                        <CardDescription className="text-xs">ID: {webhook.id}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 border-accent/20 text-accent hover:bg-accent/10"
                          onClick={() => handleTestSignal(webhook)}
                          disabled={isTesting === webhook.id}
                        >
                          {isTesting === webhook.id ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Send className="h-3 w-3 mr-2" />}
                          Test Signal
                        </Button>
                        <ShieldCheck className="h-5 w-5 text-emerald-400 mt-1" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                        <div className="flex gap-2">
                          <Input readOnly value={fullUrl} className="bg-secondary/50 border-none font-mono text-xs h-9" />
                          <Button variant="secondary" size="sm" className="h-9 px-3" onClick={() => copyToClipboard(fullUrl, `url-${webhook.id}`)}>
                            {copiedId === `url-${webhook.id}` ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Secret Key (Send as "secretKey" in JSON)</Label>
                        <div className="flex gap-2">
                          <Input readOnly type="password" value={webhook.secretKey} className="bg-secondary/50 border-none font-mono text-xs h-9" />
                          <Button variant="secondary" size="sm" className="h-9 px-3" onClick={() => copyToClipboard(webhook.secretKey, `key-${webhook.id}`)}>
                            {copiedId === `key-${webhook.id}` ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
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
