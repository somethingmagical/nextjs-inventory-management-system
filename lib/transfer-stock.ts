import { Prisma, type AdjustmentType, type TransferStatus } from "@prisma/client";

export type TransferStockOperation = {
  warehouse: "from" | "to";
  type: AdjustmentType;
};

export function getTransferStockOperations(status: TransferStatus): TransferStockOperation[] {
  if (status === "Completed") {
    return [
      { warehouse: "from", type: "Subtraction" },
      { warehouse: "to", type: "Addition" },
    ];
  }

  if (status === "Sent") {
    // Sent quantities leave the source and remain in transit until a future receipt flow.
    return [{ warehouse: "from", type: "Subtraction" }];
  }

  // Pending transfers neither move nor reserve stock.
  return [];
}

export type TransferStockSnapshot = {
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  items: { productId: string; quantity: string }[];
};

export type TransferStockDelta = {
  productId: string;
  warehouseId: string;
  type: AdjustmentType;
  quantity: string;
};

export function calculateTransferStockDeltas(
  original: TransferStockSnapshot,
  updated: TransferStockSnapshot,
): TransferStockDelta[] {
  const deltas = new Map<string, Prisma.Decimal>();

  function applySnapshot(snapshot: TransferStockSnapshot, sign: 1 | -1) {
    const operations = getTransferStockOperations(snapshot.status);
    for (const item of snapshot.items) {
      for (const operation of operations) {
        const warehouseId = operation.warehouse === "from"
          ? snapshot.fromWarehouseId
          : snapshot.toWarehouseId;
        const key = `${item.productId}\u0000${warehouseId}`;
        const quantity = new Prisma.Decimal(item.quantity);
        const signedQuantity = operation.type === "Addition"
          ? quantity.times(sign)
          : quantity.times(-sign);
        deltas.set(key, (deltas.get(key) ?? new Prisma.Decimal(0)).plus(signedQuantity));
      }
    }
  }

  applySnapshot(original, -1);
  applySnapshot(updated, 1);

  return Array.from(deltas, ([key, delta]): TransferStockDelta => {
    const [productId, warehouseId] = key.split("\u0000");
    return {
      productId,
      warehouseId,
      type: delta.isNegative() ? "Subtraction" : "Addition",
      quantity: delta.abs().toString(),
    };
  })
    .filter((delta) => !new Prisma.Decimal(delta.quantity).isZero())
    .sort((left, right) => (
      left.type === right.type
        ? left.productId.localeCompare(right.productId) || left.warehouseId.localeCompare(right.warehouseId)
        : left.type === "Subtraction" ? -1 : 1
    ));
}

export function calculateTransferDeleteStockDeltas(
  transfer: TransferStockSnapshot,
): TransferStockDelta[] {
  return calculateTransferStockDeltas(transfer, {
    fromWarehouseId: transfer.fromWarehouseId,
    toWarehouseId: transfer.toWarehouseId,
    status: "Pending",
    items: [],
  });
}
