import { Prisma, type AdjustmentType } from "@prisma/client";

export function calculateStockQuantityAdjustment(
  currentQuantity: string | Prisma.Decimal,
  targetQuantity: string | Prisma.Decimal,
) {
  const difference = new Prisma.Decimal(targetQuantity).minus(currentQuantity);
  if (difference.isZero()) return null;

  const type: AdjustmentType = difference.isPositive() ? "Addition" : "Subtraction";
  return { type, quantity: difference.abs() };
}
