import assert from "node:assert/strict";
import test from "node:test";
import { calculatePurchaseStockDeltas } from "./purchase-stock";

test("adds received purchase quantities when a purchase becomes received", () => {
  const deltas = calculatePurchaseStockDeltas(
    { warehouseId: "warehouse-a", status: "Ordered", items: [] },
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [{ productId: "product-a", quantity: "3.5" }],
    },
  );

  assert.deepEqual(
    deltas.map(({ productId, warehouseId, quantity, type }) => ({
      productId,
      warehouseId,
      quantity: quantity.toString(),
      type,
    })),
    [{
      productId: "product-a",
      warehouseId: "warehouse-a",
      quantity: "3.5",
      type: "Addition",
    }],
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
    deltas.map(({ warehouseId, quantity, type }) => ({
      warehouseId,
      quantity: quantity.toString(),
      type,
    })),
    [
      { warehouseId: "warehouse-a", quantity: "4", type: "Subtraction" },
      { warehouseId: "warehouse-b", quantity: "6", type: "Addition" },
    ],
  );
});

test("omits unchanged quantities and consolidates duplicate product lines", () => {
  const deltas = calculatePurchaseStockDeltas(
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [
        { productId: "product-a", quantity: "2" },
        { productId: "product-a", quantity: "3" },
      ],
    },
    {
      warehouseId: "warehouse-a",
      status: "Received",
      items: [
        { productId: "product-a", quantity: "1" },
        { productId: "product-a", quantity: "4" },
      ],
    },
  );

  assert.deepEqual(deltas, []);
});
