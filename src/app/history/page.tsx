
"use client";

import { LeftSidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SignalHistory } from "@/components/dashboard/SignalHistory";
import { useUser, useAuth, initiateAnonymousSignIn } from "@/firebase";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History as HistoryIcon } from "lucide-react";

export default function HistoryPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    if (!isUserLoading && !user && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <LeftSidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Signal History</h1>
              <p className="text-muted-foreground text-sm">Audit trail of all incoming webhook triggers.</p>
            </div>
            <HistoryIcon className="h-8 w-8 text-accent opacity-20" />
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Event Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <SignalHistory />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
