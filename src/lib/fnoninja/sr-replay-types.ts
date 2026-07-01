/** Public SR-audit success-story short for marketing surfaces. */
export type SrReplayShort = {
  id: string;
  title: string;
  videoUrl: string;
  symbol: string;
  label: string;
  side: "support" | "resistance";
  movePct: number | null;
  publishedAt: string;
};
