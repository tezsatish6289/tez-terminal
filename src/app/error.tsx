"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Client error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="mx-auto w-12 h-12 rounded-full bg-negative/10 border border-negative/20 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-negative" />
        </div>
        <h2 className="text-lg font-black tracking-tight text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          A temporary error occurred. This usually resolves on retry.
        </p>
        <Button
          onClick={reset}
          className="gap-2 bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 font-bold"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
