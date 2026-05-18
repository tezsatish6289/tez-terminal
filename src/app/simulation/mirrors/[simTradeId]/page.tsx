"use client";

import { useParams } from "next/navigation";
import { SimTradeMirrorsView } from "@/components/simulator/sim-live-mirrors/SimTradeMirrorsView";

export default function SimulationTradeMirrorsPage() {
  const params = useParams();
  const simTradeId = decodeURIComponent(String(params.simTradeId ?? ""));
  return <SimTradeMirrorsView simTradeId={simTradeId} />;
}
