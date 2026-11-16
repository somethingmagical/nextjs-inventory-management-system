import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type WarehouseDiscountInput = {
  warehouseId: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
};

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
    defaultDiscountType: "Fixed" | "Percentage";
    defaultDiscount: string;
    warehouseDiscounts: WarehouseDiscountInput[];
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

    const [category, brand, unit, activeWarehouses] = await Promise.all([
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
      transaction.warehouse.findMany({
        where: { deletedAt: null },
        select: { id: true },
      }),
    ]);
    const activeWarehouseIds = new Set(activeWarehouses.map((warehouse) => warehouse.id));
    if (
      !category
      || !brand
      || !unit
      || input.details.warehouseDiscounts.some((override) => !activeWarehouseIds.has(override.warehouseId))
      || new Set(input.details.warehouseDiscounts.map((override) => override.warehouseId)).size
        !== input.details.warehouseDiscounts.length
    ) return false;

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
        defaultDiscountType: input.details.defaultDiscountType,
        defaultDiscount: input.details.defaultDiscount,
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

    if (result.count !== 1) return false;

    await transaction.productWarehouseDiscount.deleteMany({
      where: {
        productId: current.id,
        warehouseId: { in: activeWarehouses.map((warehouse) => warehouse.id) },
      },
    });
    if (input.details.warehouseDiscounts.length) {
      await transaction.productWarehouseDiscount.createMany({
        data: input.details.warehouseDiscounts.map((override) => ({
          productId: current.id,
          warehouseId: override.warehouseId,
          discountType: override.discountType,
          discount: override.discount,
        })),
      });
    }

    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
