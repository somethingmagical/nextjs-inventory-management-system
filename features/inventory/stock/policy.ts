import { Prisma } from "@prisma/client";

export const stockStatuses = ["all", "in-stock", "low-stock", "out-of-stock"] as const;
export type StockStatusFilter = typeof stockStatuses[number];
export type StockStatus = Exclude<StockStatusFilter, "all">;

export function classifyStockStatus(
  quantity: string,
  stockAlert: string | null,
  reservedQuantity = "0",
): StockStatus {
  const balance = new Prisma.Decimal(quantity).minus(reservedQuantity);
  if (balance.lessThanOrEqualTo(0)) return "out-of-stock";
  if (stockAlert !== null && balance.lessThanOrEqualTo(stockAlert)) return "low-stock";
  return "in-stock";
}
