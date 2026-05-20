"use client";

/**
 * /stats — internal performance dashboard.
 *
 * Same auth model as /simulation (client-side useUser redirect). Pure
 * read-only view of headline P&L, fund-value chart and risk ratios.
 *
 * Operational controls (heatmap, tune parameters, zone-bot status, trade
 * tabs) live on /simulation; this page is for studying performance only.
 *
 * The public /freedombot/performance page is intentionally untouched and
 * keeps its own inline implementation — keeping the two surfaces
 * independent so we can iterate on the internal view without risking
 * the public one.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { StatsDashboard } from "@/components/stats/StatsDashboard";
export default function StatsPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace("/");
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="max-w-[1400px] mx-auto space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Link
                href="/simulation"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to simulator
              </Link>
              <p className="text-[10px] text-muted-foreground/45">
                Use bot tabs below for per-bot performance · shared capital in production
              </p>
            </div>

            <StatsDashboard assetType="CRYPTO" />
          </div>
        </div>
      </main>
    </div>
  );
}
