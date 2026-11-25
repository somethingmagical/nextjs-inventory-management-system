import "server-only";

import { db } from "@/lib/db";

export async function getProductDetails(id: string) {
  return db.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      categoryRecord: { select: { name: true } },
      brandRecord: { select: { name: true } },
      unitConversions: {
        where: { unit: { deletedAt: null } },
        orderBy: { unit: { name: "asc" } },
        select: { conversionFactor: true, unit: { select: { name: true } } },
      },
      warehouseDiscounts: {
        orderBy: { warehouse: { name: "asc" } },
        where: { warehouse: { deletedAt: null } },
        select: {
          discountType: true,
          discount: true,
          warehouse: { select: { name: true } },
        },
      },
      productStocks: {
        orderBy: { warehouse: { name: "asc" } },
        select: {
          quantity: true,
          reservedQuantity: true,
          status: true,
          warehouse: { select: { name: true } },
          supplier: { select: { name: true } },
          createdAt: true,
        },
      },
    },
  });
}
