import { Prisma, type AdjustmentType } from "@prisma/client";

type SaleReturnStockItem = {
  productId: string;
  quantity: string | Prisma.Decimal;
};

export function calculateSaleReturnStockDeltas(
  previousItems: readonly SaleReturnStockItem[],
  nextItems: readonly SaleReturnStockItem[],
) {
  const quantities = new Map<string, Prisma.Decimal>();

  for (const item of previousItems) {
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? new Prisma.Decimal(0))
        .minus(new Prisma.Decimal(item.quantity)),
    );
  }
  for (const item of nextItems) {
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? new Prisma.Decimal(0))
        .plus(new Prisma.Decimal(item.quantity)),
    );
  }

  return Array.from(quantities.entries())
    .sort(([productA], [productB]) => productA.localeCompare(productB))
    .flatMap(([productId, difference]) => {
      if (difference.isZero()) return [];
      const type: AdjustmentType = difference.isPositive() ? "Addition" : "Subtraction";
      return [{ productId, quantity: difference.abs(), type }];
    });
}
