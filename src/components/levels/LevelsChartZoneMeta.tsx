"use client";

export type LevelsChartZoneMetaProps = {
  expiry?: string | null;
};

export function LevelsChartZoneMeta({ expiry }: LevelsChartZoneMetaProps) {
  if (!expiry) return null;

  return (
    <p className="text-[9px] sm:text-[10px] font-medium truncate" style={{ color: "#94a3b8" }}>
      Contract expiry: <span style={{ color: "#cbd5e1" }}>{expiry}</span>
    </p>
  );
}
