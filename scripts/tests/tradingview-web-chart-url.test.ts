import assert from "node:assert/strict";
import { buildTradingViewWebChartUrl } from "../../src/lib/tradingview-symbol";
import { levelsTradingViewParams } from "../../src/lib/levels/tradingview-symbol";

{
  const url = buildTradingViewWebChartUrl("NSE:MPHASIS", "15");
  assert.ok(url.includes("symbol=NSE:MPHASIS"), url);
  assert.ok(!url.includes("%3A"), url);
  assert.ok(url.includes("interval=15"), url);
  assert.ok(url.includes("in.tradingview.com"), url);
}

{
  const cfg = levelsTradingViewParams("stock", "MPHASIS");
  assert.ok(cfg?.webChartUrl.includes("symbol=NSE:MPHASIS"), cfg?.webChartUrl);
  assert.ok(!cfg?.webChartUrl.includes("%3A"), cfg?.webChartUrl);
  assert.ok(cfg?.webChartUrl.includes("in.tradingview.com"), cfg?.webChartUrl);
  assert.ok(cfg?.dailyWebChartUrl.includes("interval=D"), cfg?.dailyWebChartUrl);
}
