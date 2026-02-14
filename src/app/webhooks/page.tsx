
"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollection, useUser, useMemoFirebase, useFirestore, useDoc, useAuth, initiateAnonymousSignIn } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { addDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Copy, Plus, Webhook as WebhookIcon, ShieldCheck, Check, Loader2, Send, AlertTriangle } from "lucide-react";
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

  // Fetch User Profile to check role
  const profileRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, "users", user.uid);
  }, [user, firestore]);

  const { data: profile, isLoading: isProfileLoading } = useDoc(profileRef);

  // If new user, set them as ADMIN for this prototype (optional - normally default to USER)
  useEffect(() => {
    if (!isProfileLoading && user && !profile && firestore) {
      const newUserRef = doc(firestore, "users", user.uid);
      setDocumentNonBlocking(newUserRef, {
        uid: user.uid,
        role: "ADMIN", // Hardcoded for first login in prototype
        createdAt: new Date().toISOString()
      }, { merge: true });
    }
  }, [profile, isProfileLoading, user, firestore]);

  const webhooksQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, "webhooks");
  }, [firestore]);

  const { data: webhooks, isLoading: isWebhooksLoading } = useCollection(webhooksQuery);

  const handleAddWebhook = () => {
    if (!user || !newWebhookName.trim() || !firestore) return;

    setIsCreating(true);
    const webhookData = {
      name: newWebhookName,
      adminId: user.uid,
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
        title: "Configuration Saved",
        description: "Admin webhook has been registered.",
      });
    }, 500);
  };

  const handleTestSignal = async (webhook: any) => {
    setIsTesting(webhook.id);
    const testPayload = {
      symbol: "BTCUSDT",
      type: "BUY",
      secretKey: webhook.secretKey,
      note: "Admin Terminal Test"
    };

    try {
      const response = await fetch(`${webhook.endpointUrl}?id=${webhook.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });
      if (response.ok) {
        toast({ title: "Signal Dispatched", description: "Global stream updated." });
      } else {
        toast({ variant: "destructive", title: "Dispatch Failed" });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Network Error" });
    } finally {
      setIsTesting(null);
    }
  };

  const isAdmin = profile?.role === "ADMIN";

  if (!isProfileLoading && !isAdmin) {
    return (
      <div className="flex min-h-screen bg-background">
        <LeftSidebar />
        <main className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-accent/20">
            <CardHeader className="text-center">
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <CardTitle>Admin Access Required</CardTitle>
              <CardDescription>Only system administrators can configure global webhooks.</CardDescription>
            </CardHeader>
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
              <p className="text-muted-foreground text-sm">System Admins only: Configure global data ingestors.</p>
            </div>
            <WebhookIcon className="h-8 w-8 text-accent opacity-20" />
          </div>

          <Card className="bg-secondary/20 border-accent/20">
            <CardHeader>
              <CardTitle className="text-lg">Register Global Webhook</CardTitle>
              <CardDescription>Create a technical entry point for external signals.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4">
                <Input 
                  placeholder="e.g. Master RSI Bridge" 
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  className="bg-background border-border flex-1"
                />
                <Button onClick={handleAddWebhook} className="bg-accent text-accent-foreground">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Global Bridge
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            {isWebhooksLoading ? (
              <div className="h-32 bg-card/50 border border-border animate-pulse rounded-xl" />
            ) : (
              webhooks?.map((webhook) => (
                <Card key={webhook.id} className="bg-card border-border">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-white">{webhook.name}</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => handleTestSignal(webhook)} disabled={isTesting === webhook.id}>
                      <Send className="h-3 w-3 mr-2" /> Test
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase">Endpoint URL</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={`${webhook.endpointUrl}?id=${webhook.id}`} className="bg-secondary/50 font-mono text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase">Secret Key</Label>
                      <Input readOnly value={webhook.secretKey} className="bg-secondary/50 font-mono text-xs" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
      <Toaster />
    </div>
  );
}
