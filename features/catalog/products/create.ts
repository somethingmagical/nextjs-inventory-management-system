import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function createProductWithInitialStock(input: {
  code: string;
  name: string;
  price: string;
  categoryId: string;
  brandId: string;
  productUnit: string;
  stockAlert: string | null;
  orderTax: string | null;
  taxType: "Exclusive" | "Inclusive";
  quantityLimitation: string | null;
  notes: string | null;
  warehouseId: string;
  supplierId: string;
  quantity: string;
  status: "Received" | "Pending" | "Ordered";
  images: string[];
  actorId: string;
}): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const [category, brand, unit, warehouse, supplier] = await Promise.all([
      transaction.category.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        select: { id: true, name: true },
      }),
      transaction.brand.findFirst({
        where: { id: input.brandId, deletedAt: null },
        select: { id: true, name: true },
      }),
      transaction.unit.findFirst({
        where: { name: input.productUnit, deletedAt: null },
        select: { name: true },
      }),
      transaction.warehouse.findFirst({
        where: { id: input.warehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.supplier.findFirst({
        where: { id: input.supplierId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    if (!category || !brand || !unit || !warehouse || !supplier) {
      return false;
    }

    const product = await transaction.product.create({
      data: {
        code: input.code,
        name: input.name,
        price: input.price,
        categoryId: category.id,
        brandId: brand.id,
        productUnit: unit.name,
        stockAlert: input.stockAlert,
        orderTax: input.orderTax,
        taxType: input.taxType,
        quantityLimitation: input.quantityLimitation,
        notes: input.notes,
        images: input.images.length ? input.images : Prisma.JsonNull,
        category: category.name,
        brand: brand.name,
        unit: unit.name,
        sellingPrice: input.price,
        alertQuantity: input.stockAlert ?? "0",
        image: input.images[0] ?? null,
        description: input.notes,
        productStocks: {
          create: {
            warehouseId: warehouse.id,
            supplierId: supplier.id,
            quantity: input.quantity,
            status: input.status,
          },
        },
      },
      select: { id: true },
    });

    const initialQuantity = new Prisma.Decimal(input.quantity);
    if (!initialQuantity.isZero()) {
      await transaction.stockMovement.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: initialQuantity,
          type: "ProductInitialization",
          sourceType: "Product",
          sourceId: product.id,
          actorId: input.actorId,
        },
      });
    }

    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
