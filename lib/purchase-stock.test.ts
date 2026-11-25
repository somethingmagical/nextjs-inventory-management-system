import assert from "node:assert/strict";
import test from "node:test";
import { calculatePurchaseStockDeltas } from "./purchase-stock";

test("moves an ordered purchase from inbound to on-hand when it is received", () => {
  const deltas = calculatePurchaseStockDeltas(
    {
      warehouseId: "warehouse-a",
      status: "Ordered",
      items: [{ productId: "product-a", quantity: "3.5" }],
    },
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [{ productId: "product-a", quantity: "3.5" }],
    },
  );

  assert.deepEqual(
    deltas.map(({ productId, warehouseId, status, quantity, type }) => ({
      productId,
      warehouseId,
      status,
      quantity: quantity.toString(),
      type,
    })),
    [
      { productId: "product-a", warehouseId: "warehouse-a", status: "Ordered", quantity: "3.5", type: "Subtraction" },
      { productId: "product-a", warehouseId: "warehouse-a", status: "Received", quantity: "3.5", type: "Addition" },
    ],
  );
});

test("reverses received stock and transfers the receipt across warehouses", () => {
  const deltas = calculatePurchaseStockDeltas(
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [{ productId: "product-a", quantity: "4" }],
    },
    {
      warehouseId: "warehouse-b",
      status: "Received",
      items: [{ productId: "product-a", quantity: "6" }],
    },
  );

  assert.deepEqual(
    deltas.map(({ warehouseId, status, quantity, type }) => ({
      warehouseId,
      status,
      quantity: quantity.toString(),
      type,
    })),
    [
      { warehouseId: "warehouse-a", status: "Received", quantity: "4", type: "Subtraction" },
      { warehouseId: "warehouse-b", status: "Received", quantity: "6", type: "Addition" },
    ],
  );
});

test("omits unchanged quantities and consolidates duplicate product lines", () => {
  const deltas = calculatePurchaseStockDeltas(
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [{ productId: "product-a", quantity: "2" }],
    },
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [{ productId: "product-a", quantity: "2" }],
    },
  );

  assert.deepEqual(deltas, []);
});
