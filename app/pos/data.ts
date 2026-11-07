import "server-only";

import { db } from "@/lib/db";
import type { PosProduct } from "./types";

export async function getPosProducts(warehouseId: string): Promise<PosProduct[]> {
  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      categoryRecord: { is: { deletedAt: null } },
      brandRecord: { is: { deletedAt: null } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      productUnit: true,
      orderTax: true,
      taxType: true,
      categoryId: true,
      categoryRecord: { select: { name: true } },
      brandId: true,
      brandRecord: { select: { name: true } },
      productStocks: {
        where: { warehouseId },
        select: { quantity: true },
      },
    },
  });

  return products.map((product) => ({
    id: product.id,
    code: product.code,
    name: product.name,
    price: product.price.toString(),
    stock: product.productStocks[0]?.quantity.toString() ?? "0",
    unit: product.productUnit,
    taxRate: product.orderTax?.toString() ?? "0",
    taxType: product.taxType,
    categoryId: product.categoryId,
    categoryName: product.categoryRecord.name,
    brandId: product.brandId,
    brandName: product.brandRecord.name,
  }));
}
