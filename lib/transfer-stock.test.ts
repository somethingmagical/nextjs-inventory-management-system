import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTransferDeleteStockDeltas,
  calculateTransferStockDeltas,
  getTransferStockOperations,
  type TransferStockSnapshot,
} from "./transfer-stock";

test("completed transfers subtract from source and add the same quantity to destination", () => {
  assert.deepEqual(getTransferStockOperations("Completed"), [
    { warehouse: "from", type: "Subtraction" },
    { warehouse: "to", type: "Addition" },
  ]);
});

test("sent transfers remove stock from the source while the goods are in transit", () => {
  assert.deepEqual(getTransferStockOperations("Sent"), [
    { warehouse: "from", type: "Subtraction" },
  ]);
});

test("pending transfers do not move or reserve stock", () => {
  assert.deepEqual(getTransferStockOperations("Pending"), []);
});

test("deleting a completed transfer reverses both warehouse movements", () => {
  assert.deepEqual(calculateTransferDeleteStockDeltas({
    fromWarehouseId: "source",
    toWarehouseId: "destination",
    status: "Completed",
    items: [{ productId: "item", quantity: "3.125" }],
  }), [
    { productId: "item", warehouseId: "destination", type: "Subtraction", quantity: "3.125" },
    { productId: "item", warehouseId: "source", type: "Addition", quantity: "3.125" },
  ]);
});

test("deleting a sent transfer restores its source stock only", () => {
  assert.deepEqual(calculateTransferDeleteStockDeltas({
    fromWarehouseId: "source",
    toWarehouseId: "destination",
    status: "Sent",
    items: [{ productId: "item", quantity: "2" }],
  }), [
    { productId: "item", warehouseId: "source", type: "Addition", quantity: "2" },
  ]);
});

test("deleting a pending transfer does not change stock", () => {
  assert.deepEqual(calculateTransferDeleteStockDeltas({
    fromWarehouseId: "source",
    toWarehouseId: "destination",
    status: "Pending",
    items: [{ productId: "item", quantity: "2" }],
  }), []);
});

test("editing a completed transfer reconciles only the quantity difference", () => {
  const original: TransferStockSnapshot = {
    fromWarehouseId: "source",
    toWarehouseId: "destination",
    status: "Completed",
    items: [{ productId: "item", quantity: "5" }],
  };
  const updated: TransferStockSnapshot = {
    ...original,
    items: [{ productId: "item", quantity: "7" }],
  };

  assert.deepEqual(calculateTransferStockDeltas(original, updated), [
    { productId: "item", warehouseId: "source", type: "Subtraction", quantity: "2" },
    { productId: "item", warehouseId: "destination", type: "Addition", quantity: "2" },
  ]);
});

test("editing transfer warehouses reverses the old move and applies the new move", () => {
  const original: TransferStockSnapshot = {
    fromWarehouseId: "source-a",
    toWarehouseId: "destination-a",
    status: "Completed",
    items: [{ productId: "item", quantity: "5" }],
  };
  const updated: TransferStockSnapshot = {
    fromWarehouseId: "source-b",
    toWarehouseId: "destination-b",
    status: "Completed",
    items: [{ productId: "item", quantity: "5" }],
  };

  assert.deepEqual(calculateTransferStockDeltas(original, updated), [
    { productId: "item", warehouseId: "source-a", type: "Addition", quantity: "5" },
    { productId: "item", warehouseId: "source-b", type: "Subtraction", quantity: "5" },
    { productId: "item", warehouseId: "destination-a", type: "Subtraction", quantity: "5" },
    { productId: "item", warehouseId: "destination-b", type: "Addition", quantity: "5" },
  ].sort((a, b) => a.type === b.type
    ? a.productId.localeCompare(b.productId) || a.warehouseId.localeCompare(b.warehouseId)
    : a.type === "Subtraction" ? -1 : 1));
});

test("changing a completed transfer to pending restores its original stock movement", () => {
  const completed: TransferStockSnapshot = {
    fromWarehouseId: "source",
    toWarehouseId: "destination",
    status: "Completed",
    items: [{ productId: "item", quantity: "3.125" }],
  };
  const pending: TransferStockSnapshot = { ...completed, status: "Pending" };

  assert.deepEqual(calculateTransferStockDeltas(completed, pending).sort((a, b) => a.type === b.type
    ? a.productId.localeCompare(b.productId) || a.warehouseId.localeCompare(b.warehouseId)
    : a.type === "Subtraction" ? -1 : 1), [
    { productId: "item", warehouseId: "destination", type: "Subtraction", quantity: "3.125" },
    { productId: "item", warehouseId: "source", type: "Addition", quantity: "3.125" },
  ]);
});

test("adding and removing products yields only their individual stock effects", () => {
  const original: TransferStockSnapshot = {
    fromWarehouseId: "source",
    toWarehouseId: "destination",
    status: "Completed",
    items: [{ productId: "removed", quantity: "2" }],
  };
  const updated: TransferStockSnapshot = {
    ...original,
    items: [{ productId: "added", quantity: "4" }],
  };

  assert.deepEqual(calculateTransferStockDeltas(original, updated), [
    { productId: "added", warehouseId: "source", type: "Subtraction", quantity: "4" },
    { productId: "removed", warehouseId: "source", type: "Addition", quantity: "2" },
    { productId: "added", warehouseId: "destination", type: "Addition", quantity: "4" },
    { productId: "removed", warehouseId: "destination", type: "Subtraction", quantity: "2" },
  ].sort((a, b) => a.type === b.type
    ? a.productId.localeCompare(b.productId) || a.warehouseId.localeCompare(b.warehouseId)
    : a.type === "Subtraction" ? -1 : 1));
});
