import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePurchaseReturnDeleteStockDeltas,
  calculatePurchaseReturnStockDeltas,
} from "./purchase-return-stock";

const received = {
  warehouseId: "warehouse-1",
  status: "Received" as const,
  items: [{ productId: "product-1", quantity: "5" }],
};

test("does not apply stock movement when a received return is unchanged", () => {
  assert.deepEqual(calculatePurchaseReturnStockDeltas(received, received), []);
});

test("deleting a received return restores its stock, while deleting a pending one has no effect", () => {
  const pending = { ...received, status: "Pending" as const };

  assert.deepEqual(
    calculatePurchaseReturnDeleteStockDeltas(received)
      .map((delta) => [delta.productId, delta.warehouseId, delta.quantity.toString(), delta.type]),
    [["product-1", "warehouse-1", "5", "Addition"]],
  );
  assert.deepEqual(calculatePurchaseReturnDeleteStockDeltas(pending), []);
});

test("applies only the quantity difference for an edited received return", () => {
  const increased = calculatePurchaseReturnStockDeltas(received, {
    ...received,
    items: [{ productId: "product-1", quantity: "7.25" }],
  });
  const decreased = calculatePurchaseReturnStockDeltas(received, {
    ...received,
    items: [{ productId: "product-1", quantity: "2.5" }],
  });

  assert.deepEqual(increased.map((delta) => [delta.quantity.toString(), delta.type]), [["2.25", "Subtraction"]]);
  assert.deepEqual(decreased.map((delta) => [delta.quantity.toString(), delta.type]), [["2.5", "Addition"]]);
});

test("reverses and applies stock when a return changes status or warehouse", () => {
  const pending = { ...received, status: "Pending" as const };
  const pendingTransition = calculatePurchaseReturnStockDeltas(received, pending);
  const receivedTransition = calculatePurchaseReturnStockDeltas(pending, received);
  const warehouseChange = calculatePurchaseReturnStockDeltas(received, {
    ...received,
    warehouseId: "warehouse-2",
    items: [{ productId: "product-1", quantity: "3" }],
  });

  assert.deepEqual(
    pendingTransition.map((delta) => [delta.warehouseId, delta.quantity.toString(), delta.type]),
    [["warehouse-1", "5", "Addition"]],
  );
  assert.deepEqual(
    receivedTransition.map((delta) => [delta.warehouseId, delta.quantity.toString(), delta.type]),
    [["warehouse-1", "5", "Subtraction"]],
  );
  assert.deepEqual(
    warehouseChange
      .map((delta) => [delta.warehouseId, delta.quantity.toString(), delta.type])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ["warehouse-1", "5", "Addition"],
      ["warehouse-2", "3", "Subtraction"],
    ],
  );
});
