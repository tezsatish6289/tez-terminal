import assert from "node:assert/strict";
import {
  defaultSymbolForBot,
  validateManualSymbolForBot,
  validateManualOpenInput,
} from "../../src/lib/manual-sim-open";

function testZoneSymbolLock() {
  assert.equal(validateManualSymbolForBot("btc", "BTCUSDT.P"), null);
  assert.equal(validateManualSymbolForBot("btc", "MORPHOUSDT.P")?.includes("BTCUSDT.P"), true);
  assert.equal(validateManualSymbolForBot("xrp", "XRPUSDT.P"), null);
  assert.equal(validateManualSymbolForBot("crypto", "MORPHOUSDT.P"), null);
  assert.equal(validateManualSymbolForBot("crypto", "ANYCOINUSDT.P"), null);
}

function testValidateManualOpenInputZone() {
  const base = {
    botId: "xrp" as const,
    exchange: "BYBIT",
    side: "SELL" as const,
    entryPrice: 2,
    stopLoss: 2.1,
    tp1: 1.9,
    tp2: 1.8,
    tp3: 1.7,
    mirrorMode: "sim" as const,
  };
  assert.equal(
    validateManualOpenInput({ ...base, symbol: "MORPHOUSDT.P" }),
    "XRP Bot only allows XRPUSDT.P (got MORPHOUSDT.P)",
  );
  assert.equal(
    validateManualOpenInput({ ...base, symbol: "XRPUSDT.P" }),
    null,
  );
  assert.equal(
    validateManualOpenInput({
      ...base,
      botId: "crypto",
      symbol: "MORPHOUSDT.P",
    }),
    null,
  );
}

function testDefaultSymbols() {
  assert.equal(defaultSymbolForBot("btc"), "BTCUSDT.P");
  assert.equal(defaultSymbolForBot("crypto"), "BTCUSDT.P");
}

testZoneSymbolLock();
testValidateManualOpenInputZone();
testDefaultSymbols();
console.log("manual-sim-open.test.ts: ok");
