import { Prisma, type AdjustmentType } from "@prisma/client";

type SaleReturnStockItem = {
  productId: string;
  quantity: string | Prisma.Decimal;
  stockConversionFactor?: string | Prisma.Decimal;
};

type SaleReturnStockState = {
  status: "Pending" | "Ordered" | "Received";
  items: readonly SaleReturnStockItem[];
};

export function calculateSaleReturnStockDeltas(
  previous: SaleReturnStockState,
  next: SaleReturnStockState,
) {
  const quantities = new Map<string, Prisma.Decimal>();

  function apply(state: SaleReturnStockState, direction: 1 | -1) {
    if (state.status !== "Received") return;
    for (const item of state.items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? new Prisma.Decimal(0))
          .plus(new Prisma.Decimal(item.quantity)
            .times(item.stockConversionFactor ?? 1)
            .times(direction)),
      );
    }
  }

  apply(previous, -1);
  apply(next, 1);

  return Array.from(quantities.entries())
    .sort(([productA], [productB]) => productA.localeCompare(productB))
    .flatMap(([productId, difference]) => {
      if (difference.isZero()) return [];
      const type: AdjustmentType = difference.isPositive() ? "Addition" : "Subtraction";
      return [{ productId, quantity: difference.abs(), type }];
    });
}
