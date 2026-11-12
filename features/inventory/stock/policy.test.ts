import assert from "node:assert/strict";
import test from "node:test";
import { classifyStockStatus } from "./policy";

test("classifies zero and negative quantities as out of stock", () => {
  assert.equal(classifyStockStatus("0.000", "5.000"), "out-of-stock");
  assert.equal(classifyStockStatus("-0.001", "5.000"), "out-of-stock");
});

test("classifies positive quantities at or below the stock alert as low stock", () => {
  assert.equal(classifyStockStatus("5.000", "5.000"), "low-stock");
  assert.equal(classifyStockStatus("4.999", "5.000"), "low-stock");
});

test("classifies quantities above the alert or without an alert as in stock", () => {
  assert.equal(classifyStockStatus("5.001", "5.000"), "in-stock");
  assert.equal(classifyStockStatus("0.001", "0.000"), "in-stock");
  assert.equal(classifyStockStatus("100.000", null), "in-stock");
});
