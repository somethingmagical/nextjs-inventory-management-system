import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { receivePurchaseStock } from "@/lib/product-stock";

type PurchaseItemInput = {
  productId: string;
  netUnitCost: string;
  quantity: string;
  unit: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Exclusive" | "Inclusive";
  orderTax: string;
};

export async function createPurchase(input: {
  warehouseId: string;
  supplierId: string;
  date: string;
  status: "Pending" | "Ordered" | "Received";
  orderTax: string;
  notes: string | null;
  items: PurchaseItemInput[];
  lineSubtotals: Prisma.Decimal[];
  discount: Prisma.Decimal;
  shipping: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  actorId: string;
}) {
  return db.$transaction(async (transaction) => {
    const [warehouse, supplier, products] = await Promise.all([
      transaction.warehouse.findFirst({
        where: { id: input.warehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.supplier.findFirst({
        where: { id: input.supplierId, deletedAt: null },
        select: { id: true },
      }),
      transaction.product.findMany({
        where: {
          id: { in: input.items.map((item) => item.productId) },
          deletedAt: null,
        },
        select: { id: true, productUnit: true },
      }),
    ]);

    if (!warehouse) throw new Error("The selected warehouse is no longer available.");
    if (!supplier) throw new Error("The selected supplier is no longer available.");
    if (products.length !== input.items.length) {
      throw new Error("One or more selected products are no longer available.");
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    const customUnits = [...new Set(input.items
      .filter((item) => productById.get(item.productId)?.productUnit !== item.unit)
      .map((item) => item.unit))];
    if (customUnits.length > 0) {
      const activeUnits = await transaction.unit.findMany({
        where: { name: { in: customUnits }, deletedAt: null },
        select: { name: true },
      });
      const activeUnitNames = new Set(activeUnits.map((unit) => unit.name));
      if (customUnits.some((unit) => !activeUnitNames.has(unit))) {
        throw new Error("One or more selected purchase units are no longer available.");
      }
    }

    const reference = `PU_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const purchase = await transaction.purchase.create({
      data: {
        reference,
        warehouseId: warehouse.id,
        supplierId: supplier.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        notes: input.notes,
        items: {
          create: input.items.map((item, index) => ({
            productId: item.productId,
            netUnitCost: new Prisma.Decimal(item.netUnitCost),
            quantity: new Prisma.Decimal(item.quantity),
            unit: item.unit,
            discountType: item.discountType,
            discount: new Prisma.Decimal(item.discount),
            taxType: item.taxType,
            orderTax: new Prisma.Decimal(item.orderTax),
            subtotal: input.lineSubtotals[index],
          })),
        },
      },
      select: { id: true },
    });

    if (input.status === "Received") {
      for (const item of input.items) {
        await receivePurchaseStock(transaction, {
          productId: item.productId,
          warehouseId: warehouse.id,
          supplierId: supplier.id,
          quantity: item.quantity,
          movement: {
            type: "PurchaseReceipt",
            sourceType: "Purchase",
            sourceId: purchase.id,
            actorId: input.actorId,
          },
        });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
