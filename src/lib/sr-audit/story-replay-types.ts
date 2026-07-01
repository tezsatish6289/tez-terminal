export interface StoryBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface StoryReplayData {
  symbol: string;
  label: string;
  scope: "stock" | "index";
  side: "support" | "resistance";
  entrySpot: number;
  maxPain: number | null;
  invalidation: number | null;
  putClusterStrike: number | null;
  putClusterSize: number | null;
  callClusterStrike: number | null;
  callClusterSize: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  zonesExpiry: string | null;
  atmIV: number | null;
  entryRr: number | null;
  movePct: number;
  maxPainDistancePct: number;
  eventAt: string;
  pocHitAt: string | null;
  resolvedAt: string | null;
  resolveReason: string | null;
  finalPnlPct: number | null;
  candles: StoryBar[];
}
