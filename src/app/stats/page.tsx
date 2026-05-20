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
import { ArrowLeft, Loader2 } from "lucide-react";

import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { StatsDashboard } from "@/components/stats/StatsDashboard";
import { cn } from "@/lib/utils";

type AssetType = "CRYPTO" | "INDIAN_STOCKS";

export default function StatsPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [assetType, setAssetType] = useState<AssetType>("CRYPTO");

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
            {/* Header row: back link + asset toggle */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Link
                href="/simulation"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to simulator
              </Link>

              <div className="flex items-center gap-0 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1 w-fit">
                {([
                  { key: "CRYPTO" as const, label: "Crypto", icon: "₿", fund: "$1,000 USDT" },
                  { key: "INDIAN_STOCKS" as const, label: "Indian Stocks", icon: "₹", fund: "₹1,00,000 INR" },
                ]).map(({ key, label, icon, fund }) => (
                  <button
                    key={key}
                    onClick={() => setAssetType(key)}
                    className={cn(
                      "relative flex items-center gap-2 px-5 lg:px-6 py-2 lg:py-2.5 rounded-lg text-xs lg:text-sm font-black uppercase tracking-wider transition-all",
                      assetType === key
                        ? "bg-accent text-black shadow-lg shadow-accent/25"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="text-sm lg:text-base">{icon}</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span>{label}</span>
                      <span className={cn(
                        "text-[9px] font-bold tracking-normal normal-case",
                        assetType === key ? "text-black/60" : "text-muted-foreground/40",
                      )}>
                        {fund}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <StatsDashboard assetType={assetType} />
          </div>
        </div>
      </main>
    </div>
  );
}
