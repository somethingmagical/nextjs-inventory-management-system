import assert from "node:assert/strict";
import test from "node:test";
import { calculateSaleStockDeltas } from "./sale-stock";

test("reconciles increased and decreased quantities for a sale edit", () => {
  const deltas = calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", items: [
      { productId: "product-a", quantity: "2" },
      { productId: "product-b", quantity: "3" },
    ] },
    { warehouseId: "warehouse-a", items: [
      { productId: "product-a", quantity: "5" },
      { productId: "product-c", quantity: "1" },
    ] },
  );

  assert.deepEqual(deltas.map((delta) => ({
    productId: delta.productId,
    warehouseId: delta.warehouseId,
    quantity: delta.quantity.toString(),
    type: delta.type,
  })), [
    { productId: "product-a", warehouseId: "warehouse-a", quantity: "3", type: "Subtraction" },
    { productId: "product-b", warehouseId: "warehouse-a", quantity: "3", type: "Addition" },
    { productId: "product-c", warehouseId: "warehouse-a", quantity: "1", type: "Subtraction" },
  ]);
});

test("returns old stock to its warehouse and subtracts from a changed warehouse", () => {
  const deltas = calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", items: [{ productId: "product-a", quantity: "4" }] },
    { warehouseId: "warehouse-b", items: [{ productId: "product-a", quantity: "4" }] },
  );

  assert.deepEqual(deltas.map((delta) => ({
    warehouseId: delta.warehouseId,
    quantity: delta.quantity.toString(),
    type: delta.type,
  })), [
    { warehouseId: "warehouse-a", quantity: "4", type: "Addition" },
    { warehouseId: "warehouse-b", quantity: "4", type: "Subtraction" },
  ]);
});

test("nets unchanged sale lines to no stock adjustment", () => {
  assert.deepEqual(calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", items: [{ productId: "product-a", quantity: "2.500" }] },
    { warehouseId: "warehouse-a", items: [{ productId: "product-a", quantity: "2.5" }] },
  ), []);
});

test("reverses all sold quantities when a sale is deleted", () => {
  const deltas = calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", items: [
      { productId: "product-a", quantity: "2.5" },
      { productId: "product-b", quantity: "4" },
    ] },
    { warehouseId: "warehouse-a", items: [] },
  );

  assert.deepEqual(deltas.map((delta) => ({
    productId: delta.productId,
    warehouseId: delta.warehouseId,
    quantity: delta.quantity.toString(),
    type: delta.type,
  })), [
    { productId: "product-a", warehouseId: "warehouse-a", quantity: "2.5", type: "Addition" },
    { productId: "product-b", warehouseId: "warehouse-a", quantity: "4", type: "Addition" },
  ]);
});
