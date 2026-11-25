import assert from "node:assert/strict";
import test from "node:test";
import { calculateSaleStockDeltas } from "./sale-stock";

test("reconciles increased and decreased quantities for a sale edit", () => {
  const deltas = calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", status: "Received", items: [
      { productId: "product-a", quantity: "2" },
      { productId: "product-b", quantity: "3" },
    ] },
    { warehouseId: "warehouse-a", status: "Received", items: [
      { productId: "product-a", quantity: "5" },
      { productId: "product-c", quantity: "1" },
    ] },
  );

  assert.deepEqual(deltas.map((delta) => ({
    productId: delta.productId,
    warehouseId: delta.warehouseId,
    effect: delta.effect,
    quantity: delta.quantity.toString(),
    type: delta.type,
  })), [
    { productId: "product-a", warehouseId: "warehouse-a", effect: "OnHand", quantity: "3", type: "Subtraction" },
    { productId: "product-b", warehouseId: "warehouse-a", effect: "OnHand", quantity: "3", type: "Addition" },
    { productId: "product-c", warehouseId: "warehouse-a", effect: "OnHand", quantity: "1", type: "Subtraction" },
  ]);
});

test("returns old stock to its warehouse and subtracts from a changed warehouse", () => {
  const deltas = calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", status: "Received", items: [{ productId: "product-a", quantity: "4" }] },
    { warehouseId: "warehouse-b", status: "Received", items: [{ productId: "product-a", quantity: "4" }] },
  );

  assert.deepEqual(deltas.map((delta) => ({
    warehouseId: delta.warehouseId,
    effect: delta.effect,
    quantity: delta.quantity.toString(),
    type: delta.type,
  })), [
    { warehouseId: "warehouse-a", effect: "OnHand", quantity: "4", type: "Addition" },
    { warehouseId: "warehouse-b", effect: "OnHand", quantity: "4", type: "Subtraction" },
  ]);
});

test("nets unchanged sale lines to no stock adjustment", () => {
  assert.deepEqual(calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", status: "Received", items: [{ productId: "product-a", quantity: "2.500" }] },
    { warehouseId: "warehouse-a", status: "Received", items: [{ productId: "product-a", quantity: "2.5" }] },
  ), []);
});

test("reverses all sold quantities when a sale is deleted", () => {
  const deltas = calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", status: "Received", items: [
      { productId: "product-a", quantity: "2.5" },
      { productId: "product-b", quantity: "4" },
    ] },
    { warehouseId: "warehouse-a", status: "Received", items: [] },
  );

  assert.deepEqual(deltas.map((delta) => ({
    productId: delta.productId,
    warehouseId: delta.warehouseId,
    effect: delta.effect,
    quantity: delta.quantity.toString(),
    type: delta.type,
  })), [
    { productId: "product-a", warehouseId: "warehouse-a", effect: "OnHand", quantity: "2.5", type: "Addition" },
    { productId: "product-b", warehouseId: "warehouse-a", effect: "OnHand", quantity: "4", type: "Addition" },
  ]);
});

test("pending and ordered sales reserve stock until the sale is received", () => {
  const reservation = calculateSaleStockDeltas(
    { warehouseId: "warehouse-a", status: "Pending", items: [] },
    {
      warehouseId: "warehouse-a",
      status: "Ordered",
      items: [{ productId: "product-a", quantity: "2", stockConversionFactor: "12" }],
    },
  );
  const received = calculateSaleStockDeltas(
    {
      warehouseId: "warehouse-a",
      status: "Ordered",
      items: [{ productId: "product-a", quantity: "2", stockConversionFactor: "12" }],
    },
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [{ productId: "product-a", quantity: "2", stockConversionFactor: "12" }],
    },
  );

  assert.deepEqual(reservation.map((delta) => [delta.effect, delta.type, delta.quantity.toString()]), [
    ["Reservation", "Addition", "24"],
  ]);
  assert.deepEqual(received.map((delta) => [delta.effect, delta.type, delta.quantity.toString()]), [
    ["Reservation", "Subtraction", "24"],
    ["OnHand", "Subtraction", "24"],
  ]);
});
