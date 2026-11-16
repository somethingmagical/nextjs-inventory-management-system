import { Prisma } from "@prisma/client";

export type ProductDiscountType = "Fixed" | "Percentage";
export type ProductDiscount = {
  discountType: ProductDiscountType;
  discount: string;
};

export function resolveProductDiscount(
  defaultDiscount: ProductDiscount,
  warehouseOverride: ProductDiscount | null,
) {
  return warehouseOverride ?? defaultDiscount;
}

export function calculateUnitDiscount(
  price: string | Prisma.Decimal,
  discountType: ProductDiscountType,
  discount: string | Prisma.Decimal,
) {
  const amount = new Prisma.Decimal(discount);
  if (discountType === "Fixed") {
    return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  return new Prisma.Decimal(price)
    .times(amount)
    .dividedBy(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateFixedLineDiscount(
  discountPerUnit: string | Prisma.Decimal,
  quantity: string | Prisma.Decimal,
) {
  return new Prisma.Decimal(discountPerUnit)
    .times(new Prisma.Decimal(quantity))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
