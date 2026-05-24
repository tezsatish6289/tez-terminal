"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Rocket, Loader2 } from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { usePublicBots } from "@/hooks/use-public-bots";
import { DeployModal } from "../components/DeployModal";
import type { DeploymentWallet } from "../components/BotSettings";
import type { TradingPrefs } from "@/lib/freedombot/trading-prefs-shared";
import {
  BotDiscoverySection,
} from "@/components/freedombot/dashboard/BotDiscoverySection";
import {
  RunningBotCards,
  type DashboardDeployment,
} from "@/components/freedombot/dashboard/RunningBotCards";
import { freedombotDashboardBase } from "@/lib/freedombot/dashboard-path";

interface Deployment extends DashboardDeployment {
  keyLastFour?: string | null;
  pausedAt?: string | null;
  wallet?: DeploymentWallet | null;
  tradingPrefs?: TradingPrefs;
  openTradeCount?: number;
  closedTradeCount?: number;
}

interface BotStats {
  runningDays: number;
  currentCapital?: number;
  startingCapital?: number;
  totalReturnPct: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
  isAnnualizationReliable?: boolean;
}

function NotConnected({ stats, onDeploy }: { stats: BotStats | null; onDeploy: () => void }) {
  const { bots: publicBots } = usePublicBots();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <div className="text-center mb-16">
        <div
          className="relative p-1 rounded-3xl inline-block mb-8"
          style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.4), rgba(96,165,250,0.2))" }}
        >
          <Image src="/freedombot/icon.png" alt="FreedomBot" width={80} height={80} className="rounded-2xl object-contain" />
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4 text-white">
          Connect your bot
        </h1>
        <p className="text-base sm:text-lg max-w-md mx-auto leading-relaxed mb-8" style={{ color: "#64748b" }}>
          You haven&apos;t deployed a bot yet. Connect your broker or exchange and let FreedomBot trade financial markets for you 24/7.
        </p>

        <button
          type="button"
          onClick={onDeploy}
          className="h-14 px-10 rounded-2xl font-bold text-base text-white flex items-center gap-2.5 mx-auto transition-all hover:scale-105 shadow-lg"
          style={{
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            boxShadow: "0 8px 30px rgba(59,130,246,0.35)",
          }}
        >
          <Rocket className="h-5 w-5" />
          Deploy Your Bot
        </button>

        <p className="text-xs mt-4" style={{ color: "#334155" }}>
          Takes less than 5 minutes · No withdrawal access required
        </p>
      </div>

      <div
        className="rounded-2xl p-6 sm:p-8 mb-8"
        style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.15)" }}
      >
        <h2 className="text-lg font-black text-white mb-6">How it works</h2>
        <div className="space-y-5">
          {[
            { step: "1", title: "Connect your broker or exchange", desc: "Link your account via API key. Read + trade access only — withdrawals are never enabled." },
            { step: "2", title: "Fund your account", desc: "Deposit capital into your broker or exchange. FreedomBot only trades what's already there — no transfers needed." },
            { step: "3", title: "Bot starts trading", desc: "FreedomBot begins executing trades across markets automatically. Your dashboard updates with live performance." },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-4">
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5"
                style={{ backgroundColor: "rgba(37,99,235,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}
              >
                {item.step}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{item.title}</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#475569" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <BotDiscoverySection publicBots={publicBots} stats={stats} onDeploy={onDeploy} showHeading={false} />
    </div>
  );
}

function ConnectedDashboard({
  deployments,
  stats,
  onDeploy,
}: {
  deployments: Deployment[];
  stats: BotStats | null;
  onDeploy: () => void;
}) {
  const { bots: publicBots } = usePublicBots();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <section>
        <h2 className="text-lg font-black text-white mb-4">Your bots</h2>
        <RunningBotCards deployments={deployments} publicBots={publicBots} />
      </section>

      <BotDiscoverySection publicBots={publicBots} stats={stats} onDeploy={onDeploy} />
    </div>
  );
}

export default function FreedomBotDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#080f1e" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
        </div>
      }
    >
      <FreedomBotDashboardInner />
    </Suspense>
  );
}

function FreedomBotDashboardInner() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[] | undefined>(undefined);
  const [stats, setStats] = useState<BotStats | null>(null);

  useEffect(() => {
    if (searchParams.get("deploy") !== "1") return;
    setDeployOpen(true);
    router.replace(freedombotDashboardBase(pathname));
  }, [searchParams, router, pathname]);

  useEffect(() => {
    if (!isUserLoading && !user) {
      window.location.href = "/";
    }
  }, [user, isUserLoading]);

  useEffect(() => {
    document.title = "FreedomBot.ai — Dashboard";
    document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon']").forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = `/freedombot/icon.png?v=${Date.now()}`;
    document.head.appendChild(link);
  }, []);

  const fetchDeployment = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/my-deployment", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      const list: Deployment[] = Array.isArray(data.deployments)
        ? data.deployments
        : data.deployment
          ? [data.deployment]
          : [];
      setDeployments(list);
    } catch {
      setDeployments([]);
    }
  }, [user]);

  const autoTestedDeploymentsRef = useRef<Set<string>>(new Set());

  const applyWalletPatch = useCallback(
    (deploymentId: string, wallet: DeploymentWallet | null) => {
      setDeployments((prev) =>
        prev?.map((d) => (d.id === deploymentId ? { ...d, wallet } : d)),
      );
    },
    [],
  );

  const refreshWalletForDeployment = useCallback(
    async (deploymentId: string, force: boolean) => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/freedombot/test-connection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ deploymentId, force }),
        });
        const data = await res.json();
        if (typeof data.status === "string") {
          applyWalletPatch(deploymentId, {
            total: typeof data.total === "number" ? data.total : null,
            available: typeof data.available === "number" ? data.available : null,
            currency: typeof data.currency === "string" ? data.currency : null,
            status: data.status === "valid" ? "valid" : "invalid",
            error: typeof data.error === "string" ? data.error : null,
            checkedAt: typeof data.checkedAt === "string" ? data.checkedAt : null,
          });
        }
      } catch {
        // Non-fatal — cached wallet stays visible.
      }
    },
    [user, applyWalletPatch],
  );

  useEffect(() => {
    if (!user || !deployments?.length) return;
    for (const dep of deployments) {
      if (autoTestedDeploymentsRef.current.has(dep.id)) continue;
      autoTestedDeploymentsRef.current.add(dep.id);
      void refreshWalletForDeployment(dep.id, false);
    }
  }, [user, deployments, refreshWalletForDeployment]);

  useEffect(() => {
    void fetchDeployment();
  }, [fetchDeployment]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/freedombot/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [user]);

  const handleDeployClose = useCallback(() => {
    setDeployOpen(false);
    autoTestedDeploymentsRef.current.clear();
    void fetchDeployment();
  }, [fetchDeployment]);

  if (isUserLoading || deployments === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#080f1e" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#080f1e" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>
      {!deployments.length ? (
        <NotConnected stats={stats} onDeploy={() => setDeployOpen(true)} />
      ) : (
        <ConnectedDashboard
          deployments={deployments}
          stats={stats}
          onDeploy={() => setDeployOpen(true)}
        />
      )}

      <DeployModal
        isOpen={deployOpen}
        onClose={handleDeployClose}
        user={user}
        auth={auth}
      />
    </div>
  );
}
