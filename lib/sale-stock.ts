import { Prisma, type AdjustmentType } from "@prisma/client";

type SaleStockItem = {
  productId: string;
  quantity: string | Prisma.Decimal;
};

type SaleStockState = {
  warehouseId: string;
  items: readonly SaleStockItem[];
};

export function calculateSaleStockDeltas(previous: SaleStockState, next: SaleStockState) {
  const deltas = new Map<string, {
    productId: string;
    warehouseId: string;
    quantity: Prisma.Decimal;
  }>();

  function apply(state: SaleStockState, direction: 1 | -1) {
    for (const item of state.items) {
      const key = JSON.stringify([state.warehouseId, item.productId]);
      const current = deltas.get(key);
      deltas.set(key, {
        productId: item.productId,
        warehouseId: state.warehouseId,
        quantity: (current?.quantity ?? new Prisma.Decimal(0))
          .plus(new Prisma.Decimal(item.quantity).times(direction)),
      });
    }
  }

  // Reverse the previous sale's stock effect, then apply the edited sale's effect.
  apply(previous, 1);
  apply(next, -1);

  return Array.from(deltas.values()).flatMap(({ productId, warehouseId, quantity }) => {
    if (quantity.isZero()) return [];
    const type: AdjustmentType = quantity.isPositive() ? "Addition" : "Subtraction";
    return [{
      productId,
      warehouseId,
      quantity: quantity.abs(),
      type,
    }];
  });
}
