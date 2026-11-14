import assert from "node:assert/strict";
import test from "node:test";
import { calculateStockQuantityAdjustment } from "./quantity-adjustment";

test("calculates an addition to reach the target stock quantity", () => {
  const adjustment = calculateStockQuantityAdjustment("4.125", "7.5");

  assert.equal(adjustment?.type, "Addition");
  assert.equal(adjustment?.quantity.toString(), "3.375");
});

test("calculates a subtraction to reach the target stock quantity", () => {
  const adjustment = calculateStockQuantityAdjustment("7.5", "4.125");

  assert.equal(adjustment?.type, "Subtraction");
  assert.equal(adjustment?.quantity.toString(), "3.375");
});

test("does not create an adjustment when the target quantity is unchanged", () => {
  assert.equal(calculateStockQuantityAdjustment("4.125", "4.125"), null);
});
