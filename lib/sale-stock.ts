import { Prisma, type AdjustmentType } from "@prisma/client";

type SaleStockItem = {
  productId: string;
  quantity: string | Prisma.Decimal;
  stockConversionFactor?: string | Prisma.Decimal;
};

type SaleStockState = {
  warehouseId: string;
  status: "Pending" | "Ordered" | "Received";
  items: readonly SaleStockItem[];
};

export function calculateSaleStockDeltas(previous: SaleStockState, next: SaleStockState) {
  const deltas = new Map<string, {
    productId: string;
    warehouseId: string;
    effect: "OnHand" | "Reservation";
    quantity: Prisma.Decimal;
  }>();

  function apply(state: SaleStockState, direction: 1 | -1) {
    for (const item of state.items) {
      const effect = state.status === "Received" ? "OnHand" : "Reservation";
      const key = JSON.stringify([state.warehouseId, item.productId, effect]);
      const current = deltas.get(key);
      const quantity = new Prisma.Decimal(item.quantity)
        .times(item.stockConversionFactor ?? 1)
        .times(state.status === "Received" ? -direction : direction);
      deltas.set(key, {
        productId: item.productId,
        warehouseId: state.warehouseId,
        effect,
        quantity: (current?.quantity ?? new Prisma.Decimal(0)).plus(quantity),
      });
    }
  }

  apply(previous, -1);
  apply(next, 1);

  return Array.from(deltas.values()).flatMap(({ productId, warehouseId, effect, quantity }) => {
    if (quantity.isZero()) return [];
    const type: AdjustmentType = quantity.isPositive() ? "Addition" : "Subtraction";
    return [{
      productId,
      warehouseId,
      effect,
      quantity: quantity.abs(),
      type,
    }];
  });
}
