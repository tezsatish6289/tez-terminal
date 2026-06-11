"use client";

import { formatClusterContracts } from "@/lib/levels/format-cluster-size";

export type LevelsChartZoneMetaProps = {
  expiry?: string | null;
  putClusterSize?: number | null;
  callClusterSize?: number | null;
};

export function LevelsChartZoneMeta({
  expiry,
  putClusterSize,
  callClusterSize,
}: LevelsChartZoneMetaProps) {
  const putLabel = formatClusterContracts(putClusterSize);
  const callLabel = formatClusterContracts(callClusterSize);

  if (!expiry && !putLabel && !callLabel) return null;

  const clusterParts: string[] = [];
  if (putLabel) clusterParts.push(`Put cluster ${putLabel} contracts`);
  if (callLabel) clusterParts.push(`Call cluster ${callLabel} contracts`);

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {expiry ? (
        <p className="text-[9px] sm:text-[10px] font-medium truncate" style={{ color: "#94a3b8" }}>
          Contract expiry: <span style={{ color: "#cbd5e1" }}>{expiry}</span>
        </p>
      ) : null}
      {clusterParts.length > 0 ? (
        <p className="text-[9px] sm:text-[10px] font-medium truncate" style={{ color: "#94a3b8" }}>
          {clusterParts.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
