"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ExchangeMirrorsView } from "@/components/simulator/sim-live-mirrors/ExchangeMirrorsView";

function ExchangeMirrorsFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}

export default function SimulationExchangeMirrorsPage() {
  const params = useParams();
  const exchange = decodeURIComponent(String(params.exchange ?? "")).toUpperCase();

  return (
    <Suspense fallback={<ExchangeMirrorsFallback />}>
      <ExchangeMirrorsView exchange={exchange} />
    </Suspense>
  );
}
