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

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { StatsDashboard } from "@/components/stats/StatsDashboard";
export default function StatsPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [shareView, setShareView] = useState(false);

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
    <div
      className={cn(
        "flex min-h-screen text-foreground",
        shareView ? "bg-[#080f1e]" : "bg-background",
      )}
    >
      <main className="flex-1 flex flex-col min-w-0">
        {!shareView && <TopBar />}

        <div
          className={cn(
            "flex-1 overflow-y-auto",
            shareView ? "p-6 flex items-center justify-center" : "p-4 space-y-4",
          )}
        >
          <div
            className={cn(
              shareView ? "flex flex-col items-center gap-4" : "max-w-[1400px] mx-auto space-y-4 w-full",
            )}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap w-full max-w-[1400px]">
              {!shareView ? (
                <Link
                  href="/simulation"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to simulator
                </Link>
              ) : (
                <span className="text-[11px] font-medium" style={{ color: "#64748b" }}>
                  Screenshot this card for LinkedIn (1200×720) · pick bot filter first for per-bot stats
                </span>
              )}

              <button
                type="button"
                onClick={() => setShareView((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all",
                  shareView
                    ? "bg-[#3b82f6] text-white shadow-lg shadow-blue-500/20"
                    : "border border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                )}
              >
                <Share2 className="h-3.5 w-3.5" />
                {shareView ? "Exit share view" : "Social share view"}
              </button>
            </div>

            {!shareView && (
              <p className="text-[10px] text-muted-foreground/45 max-w-[1400px]">
                Use bot tabs below for per-bot performance · shared capital in production
              </p>
            )}

            <StatsDashboard assetType="CRYPTO" shareView={shareView} />
          </div>
        </div>
      </main>
    </div>
  );
}
