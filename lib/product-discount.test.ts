import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFixedLineDiscount,
  calculateUnitDiscount,
  resolveProductDiscount,
} from "./product-discount";

test("calculates fixed discounts per unit and per line", () => {
  const unitDiscount = calculateUnitDiscount("12.50", "Fixed", "1.25");

  assert.equal(unitDiscount.toFixed(2), "1.25");
  assert.equal(calculateFixedLineDiscount(unitDiscount, "3").toFixed(2), "3.75");
});

test("rounds percentage discounts to currency precision", () => {
  assert.equal(calculateUnitDiscount("10.00", "Percentage", "12.5").toFixed(2), "1.25");
});

test("resolves warehouse overrides and preserves an explicit zero", () => {
  const defaultDiscount = { discountType: "Percentage" as const, discount: "10" };
  assert.deepEqual(resolveProductDiscount(defaultDiscount, null), defaultDiscount);
  assert.deepEqual(
    resolveProductDiscount(defaultDiscount, { discountType: "Fixed", discount: "0" }),
    { discountType: "Fixed", discount: "0" },
  );
});
