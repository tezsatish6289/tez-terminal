import assert from "node:assert/strict";
import { LineStyle } from "lightweight-charts";
import {
  mergeCoincidentPriceLines,
  type PriceLineSpec,
} from "../../src/components/levels/native-chart-level-overlays";

const spec = (
  price: number,
  title: string,
  mergeOrder: number,
): PriceLineSpec => ({
  price,
  color: "#fff",
  title,
  style: LineStyle.Dashed,
  width: 2,
  mergeOrder,
});

const merged = mergeCoincidentPriceLines(
  [
    spec(900, "Max Pain", 0),
    spec(900, "Put OI peak", 10),
    spec(940, "Call OI peak", 11),
  ],
  false,
);

assert.equal(merged.length, 2);
assert.equal(merged.find((m) => m.price === 900)?.title, "Max Pain · Put OI peak");
assert.equal(merged.find((m) => m.price === 940)?.title, "Call OI peak");

const compact = mergeCoincidentPriceLines(
  [spec(900, "Max Pain", 0), spec(900.004, "Put OI peak", 10)],
  true,
);
assert.equal(compact.length, 1);
assert.equal(compact[0]?.title, "MP·Put OI");

console.log("native-chart-level-overlays tests ok");
