import { Prisma, type AdjustmentType } from "@prisma/client";

type StockEffect = {
  productId: string;
  quantity: string | Prisma.Decimal;
};

export type PurchaseStockState = {
  warehouseId: string;
  status: "Pending" | "Ordered" | "Received";
  items: readonly StockEffect[];
};

export function calculatePurchaseStockDeltas(
  previous: PurchaseStockState,
  next: PurchaseStockState,
) {
  const deltas = new Map<
    string,
    { productId: string; warehouseId: string; quantity: Prisma.Decimal }
  >();

  function apply(state: PurchaseStockState, direction: 1 | -1) {
    if (state.status !== "Received") return;

    for (const item of state.items) {
      const key = JSON.stringify([state.warehouseId, item.productId]);
      const current = deltas.get(key);
      const quantity = new Prisma.Decimal(item.quantity).times(direction);
      deltas.set(key, {
        productId: item.productId,
        warehouseId: state.warehouseId,
        quantity: (current?.quantity ?? new Prisma.Decimal(0)).plus(quantity),
      });
    }
  }

  apply(previous, -1);
  apply(next, 1);

  return Array.from(deltas.values()).flatMap(
    ({ productId, warehouseId, quantity }) => {
      if (quantity.isZero()) return [];
      const type: AdjustmentType = quantity.isPositive()
        ? "Addition"
        : "Subtraction";
      return [{ productId, warehouseId, quantity: quantity.abs(), type }];
    },
  );
}
