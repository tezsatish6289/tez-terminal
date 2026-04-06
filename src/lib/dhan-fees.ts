/**
 * Pure fee calculation for Dhan/NSE intraday (MIS) trades.
 * No server-side or firebase-admin dependencies — safe to import from
 * both client components and server-side code.
 *
 * Source: https://dhan.co/pricing/ — Equity (Intraday) column.
 *
 * @param positionValue - INR value of the position leg (e.g. ₹50,000)
 * @param side          - 'buy' for entry on LONG / exit on SHORT
 *                        'sell' for exit on LONG / entry on SHORT
 * @returns total charges in INR for that single leg
 *
 * Breakdown:
 *   - Brokerage:        min(₹20, 0.03%) per order
 *   - NSE exchange:     0.0030699% of turnover
 *   - GST:             18% on (brokerage + exchange charges + SEBI + IPFT)
 *   - SEBI fees:        0.0001% of turnover (₹10 per crore)
 *   - IPFT:            0.0000001% of turnover
 *   - STT:             0.025% on sell side only (intraday equity)
 *   - Stamp duty:      0.003% on buy side only
 */
export function calcDhanFees(positionValue: number, side: "buy" | "sell"): number {
  const brokerage      = Math.min(20, positionValue * 0.0003);
  const exchangeCharge = positionValue * 0.000030699; // NSE: 0.0030699%
  const sebi           = positionValue * 0.000001;    // 0.0001%
  const ipft           = positionValue * 0.000000001; // 0.0000001%
  const gst            = (brokerage + exchangeCharge + sebi + ipft) * 0.18;
  const stt            = side === "sell" ? positionValue * 0.00025 : 0;
  const stamp          = side === "buy"  ? positionValue * 0.00003 : 0;
  return brokerage + exchangeCharge + sebi + ipft + gst + stt + stamp;
}
