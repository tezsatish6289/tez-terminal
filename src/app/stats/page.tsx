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

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { StatsDashboard } from "@/components/stats/StatsDashboard";
import { CRYPTO_BOTS, type CryptoBotId } from "@/lib/crypto-bots";

function StatsDashboardFromQuery({ shareView }: { shareView: boolean }) {
  const searchParams = useSearchParams();
  const raw = searchParams.get("bot");
  const initialBotId =
    raw && CRYPTO_BOTS.some((b) => b.id === raw) ? (raw as CryptoBotId) : undefined;

  return (
    <StatsDashboard assetType="CRYPTO" shareView={shareView} initialBotId={initialBotId} />
  );
}

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
            shareView ? "p-6 flex items-center justify-center" : "p-5 sm:p-6 space-y-6",
          )}
        >
          <div
            className={cn(
              shareView ? "flex flex-col items-center gap-6" : "max-w-[1200px] mx-auto space-y-6 w-full",
            )}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap w-full max-w-[1200px]">
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

            <Suspense
              fallback={
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              }
            >
              <StatsDashboardFromQuery shareView={shareView} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
