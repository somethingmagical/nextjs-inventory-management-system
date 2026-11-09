import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function updateProductDetails(input: {
  id: string;
  expectedUpdatedAt: Date;
  details: {
    code: string;
    name: string;
    categoryId: string;
    brandId: string;
    price: string;
    productUnit: string;
    stockAlert: string | null;
    orderTax: string | null;
    taxType: "Exclusive" | "Inclusive";
    quantityLimitation: string | null;
    notes: string | null;
  };
  images: string[];
}): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const current = await transaction.product.findFirst({
      where: { id: input.id, deletedAt: null },
      select: { id: true, updatedAt: true },
    });
    if (!current || current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return false;
    }

    const [category, brand, unit] = await Promise.all([
      transaction.category.findFirst({
        where: { id: input.details.categoryId, deletedAt: null },
        select: { id: true, name: true },
      }),
      transaction.brand.findFirst({
        where: { id: input.details.brandId, deletedAt: null },
        select: { id: true, name: true },
      }),
      transaction.unit.findFirst({
        where: { name: input.details.productUnit, deletedAt: null },
        select: { name: true },
      }),
    ]);
    if (!category || !brand || !unit) return false;

    const result = await transaction.product.updateMany({
      where: { id: current.id, updatedAt: current.updatedAt, deletedAt: null },
      data: {
        code: input.details.code,
        name: input.details.name,
        price: input.details.price,
        categoryId: category.id,
        brandId: brand.id,
        productUnit: unit.name,
        stockAlert: input.details.stockAlert,
        orderTax: input.details.orderTax,
        taxType: input.details.taxType,
        quantityLimitation: input.details.quantityLimitation,
        notes: input.details.notes,
        images: input.images.length ? input.images : Prisma.JsonNull,
        category: category.name,
        brand: brand.name,
        unit: unit.name,
        sellingPrice: input.details.price,
        alertQuantity: input.details.stockAlert ?? "0",
        image: input.images[0] ?? null,
        description: input.details.notes,
      },
    });

    return result.count === 1;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
