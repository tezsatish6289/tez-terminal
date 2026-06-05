/** Static NSE index metadata — safe for client bundles (no NSE I/O). */

export type IndexKey = "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "MIDCPNIFTY" | "NIFTYNXT50";

export interface IndexSpec {
  /** NSE option-chain symbol (query param). */
  symbol: IndexKey;
  /** Human label for the UI. */
  label: string;
  /** Strike grid spacing near ATM (NSE-listed). */
  strikeStep: number;
  /** bearStrike − bullStrike must be at least this many index points. */
  minStrikeGap: number;
  /** ±points around each dominant strike; full band = 2×. */
  zoneHalfWidthPts: number;
}

/** The five indices on nseindia.com/option-chain, with their listed strike grids. */
export const INDEX_SPECS: Record<IndexKey, IndexSpec> = {
  NIFTY:      { symbol: "NIFTY",      label: "Nifty 50",      strikeStep: 50,  minStrikeGap: 600,  zoneHalfWidthPts: 150 },
  BANKNIFTY:  { symbol: "BANKNIFTY",  label: "Bank Nifty",    strikeStep: 100, minStrikeGap: 1500, zoneHalfWidthPts: 400 },
  FINNIFTY:   { symbol: "FINNIFTY",   label: "Fin Nifty",     strikeStep: 50,  minStrikeGap: 700,  zoneHalfWidthPts: 200 },
  MIDCPNIFTY: { symbol: "MIDCPNIFTY", label: "Midcap Nifty",  strikeStep: 25,  minStrikeGap: 400,  zoneHalfWidthPts: 120 },
  NIFTYNXT50: { symbol: "NIFTYNXT50", label: "Nifty Next 50", strikeStep: 100, minStrikeGap: 2000, zoneHalfWidthPts: 600 },
};

export const INDEX_KEYS = Object.keys(INDEX_SPECS) as IndexKey[];
