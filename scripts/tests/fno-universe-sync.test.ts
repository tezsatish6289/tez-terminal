import assert from "node:assert/strict";
import {
  orderFnoSymbols,
  TIER_B,
} from "../../src/lib/nse/fno-universe";
import {
  parseDhanFnoUnderlyings,
  sanitizeFnoStockSymbols,
} from "../../src/lib/nse/fno-universe-parse";

const SAMPLE_CSV = `SEM_EXM_EXCH_ID,SEM_SEGMENT,SEM_SMST_SECURITY_ID,SEM_INSTRUMENT_NAME,SEM_TRADING_SYMBOL,SEM_CUSTOM_SYMBOL
NSE,D,1,OPTSTK,RELIANCE-Jun2026-1400-CE,RELIANCE 30 JUN 1400 CALL
NSE,D,2,FUTSTK,RELIANCE-Jun2026-FUT,RELIANCE 30 JUN FUT
NSE,E,3,EQUITY,RELIANCE,RELIANCE
NSE,D,4,OPTSTK,NIFTY-Jun2026-24000-CE,NIFTY 30 JUN 24000 CALL
NSE,D,5,OPTSTK,011NSETEST-Jun2026-100-CE,TEST
NSE,E,6,EQUITY,011NSETEST,TEST
NSE,D,7,FUTSTK,WAAREEENER-Mar2026-FUT,WAAREEENER MAR FUT
NSE,E,8,EQUITY,WAAREEENER,WAAREEENER
`;

assert.deepEqual(sanitizeFnoStockSymbols(["reliance", "NIFTY", "011NSETEST"]), ["RELIANCE"]);

const parsed = parseDhanFnoUnderlyings(SAMPLE_CSV);
assert(parsed.includes("RELIANCE"));
assert(parsed.includes("WAAREEENER"));
assert(!parsed.includes("NIFTY"));
assert(!parsed.some((s) => s.includes("NSETEST")));

const ordered = orderFnoSymbols(["ZOMATO", "RELIANCE", "ABB"]);
assert(ordered[0] === "RELIANCE", "Tier B names lead the queue");
assert(ordered.indexOf("RELIANCE") < ordered.indexOf("ABB"));
assert(ordered.indexOf("ABB") < ordered.indexOf("ZOMATO"));
assert(TIER_B.includes("RELIANCE"));

console.log("fno-universe-sync tests ok");
