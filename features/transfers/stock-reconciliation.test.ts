import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTransferDeleteStockDeltas,
  calculateTransferStockDeltas,
  getTransferStockOperations,
  type TransferStockSnapshot,
} from "@/lib/transfer-stock";

const transfer = (status: TransferStockSnapshot["status"]): TransferStockSnapshot => ({
  fromWarehouseId: "source",
  toWarehouseId: "destination",
  status,
  items: [{ productId: "product", quantity: "5" }],
});

test("pending transfers do not move or reserve stock", () => {
  assert.deepEqual(getTransferStockOperations("Pending"), []);
  assert.deepEqual(calculateTransferStockDeltas(transfer("Pending"), transfer("Pending")), []);
});

test("sending subtracts from the source and completing adds to the destination", () => {
  assert.deepEqual(
    calculateTransferStockDeltas(transfer("Pending"), transfer("Sent")),
    [{
      productId: "product",
      warehouseId: "source",
      type: "Subtraction",
      quantity: "5",
    }],
  );
  assert.deepEqual(
    calculateTransferStockDeltas(transfer("Sent"), transfer("Completed")),
    [{
      productId: "product",
      warehouseId: "destination",
      type: "Addition",
      quantity: "5",
    }],
  );
});

test("editing a completed transfer reconciles only changed stock, subtractions first", () => {
  const updated = {
    ...transfer("Completed"),
    fromWarehouseId: "new-source",
    toWarehouseId: "new-destination",
    items: [{ productId: "product", quantity: "3" }],
  };
  assert.deepEqual(calculateTransferStockDeltas(transfer("Completed"), updated), [
    {
      productId: "product",
      warehouseId: "destination",
      type: "Subtraction",
      quantity: "5",
    },
    {
      productId: "product",
      warehouseId: "new-source",
      type: "Subtraction",
      quantity: "3",
    },
    {
      productId: "product",
      warehouseId: "new-destination",
      type: "Addition",
      quantity: "3",
    },
    {
      productId: "product",
      warehouseId: "source",
      type: "Addition",
      quantity: "5",
    },
  ]);
});

test("deleting reverses sent and completed stock effects", () => {
  assert.deepEqual(calculateTransferDeleteStockDeltas(transfer("Sent")), [{
    productId: "product",
    warehouseId: "source",
    type: "Addition",
    quantity: "5",
  }]);
  assert.deepEqual(calculateTransferDeleteStockDeltas(transfer("Completed")), [
    {
      productId: "product",
      warehouseId: "destination",
      type: "Subtraction",
      quantity: "5",
    },
    {
      productId: "product",
      warehouseId: "source",
      type: "Addition",
      quantity: "5",
    },
  ]);
});
