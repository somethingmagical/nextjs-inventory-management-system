import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  applyStockAdjustment,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import {
  calculatePurchaseReturnDeleteStockDeltas,
  calculatePurchaseReturnStockDeltas,
} from "@/lib/purchase-return-stock";

type PurchaseReturnItemInput = {
  productId: string;
  netUnitCost: string;
  quantity: string;
  unit: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Exclusive" | "Inclusive";
  orderTax: string;
};

type PurchaseReturnSaveInput = {
  returnId?: string;
  warehouseId: string;
  supplierId: string;
  date: string;
  status: "Pending" | "Ordered" | "Received";
  orderTax: string;
  discount: string;
  shipping: string;
  notes: string | null;
  items: PurchaseReturnItemInput[];
  lineSubtotals: Prisma.Decimal[];
  totals: {
    discount: Prisma.Decimal;
    shipping: Prisma.Decimal;
    grandTotal: Prisma.Decimal;
  };
  actorId: string;
};

export async function savePurchaseReturn(input: PurchaseReturnSaveInput): Promise<void> {
  await db.$transaction(async (transaction) => {
    const [warehouse, supplier, products, existingReturn] = await Promise.all([
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
        select: { id: true, name: true, productUnit: true },
      }),
      input.returnId
        ? transaction.purchaseReturn.findFirst({
            where: { id: input.returnId, deletedAt: null },
            select: {
              id: true,
              warehouseId: true,
              status: true,
              paid: true,
              items: {
                select: {
                  productId: true,
                  quantity: true,
                  product: { select: { name: true } },
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);

    if (!warehouse) throw new Error("The selected warehouse is no longer available.");
    if (!supplier) throw new Error("The selected supplier is no longer available.");
    if (input.returnId && !existingReturn) {
      throw new Error("This purchase return no longer exists or has already been deleted.");
    }
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
        throw new Error("One or more selected purchase return units are no longer available.");
      }
    }

    const itemData = input.items.map((item, index) => ({
      productId: item.productId,
      netUnitCost: new Prisma.Decimal(item.netUnitCost),
      quantity: new Prisma.Decimal(item.quantity),
      unit: item.unit,
      discountType: item.discountType,
      discount: new Prisma.Decimal(item.discount),
      taxType: item.taxType,
      orderTax: new Prisma.Decimal(item.orderTax),
      subtotal: input.lineSubtotals[index],
    }));

    if (existingReturn) {
      if (existingReturn.paid.greaterThan(input.totals.grandTotal)) {
        throw new Error("The new grand total cannot be less than the amount already paid.");
      }

      const stockDeltas = calculatePurchaseReturnStockDeltas(
        {
          warehouseId: existingReturn.warehouseId,
          status: existingReturn.status,
          items: existingReturn.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
        {
          warehouseId: warehouse.id,
          status: input.status,
          items: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      );
      const previousProductNames = new Map(
        existingReturn.items.map((item) => [item.productId, item.product.name]),
      );

      // Net old and new received quantities so edits apply only the stock difference.
      for (const delta of stockDeltas) {
        const product = productById.get(delta.productId);
        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName: product?.name ?? previousProductNames.get(delta.productId) ?? "product",
          warehouseId: delta.warehouseId,
          quantity: delta.quantity.toString(),
          type: delta.type,
          documentLabel: "purchase return edit",
          movement: {
            type: "Reconciliation",
            sourceType: "PurchaseReturn",
            sourceId: existingReturn.id,
            actorId: input.actorId,
          },
        });
      }

      await transaction.purchaseReturn.update({
        where: { id: existingReturn.id },
        data: {
          warehouseId: warehouse.id,
          supplierId: supplier.id,
          date: new Date(`${input.date}T00:00:00.000Z`),
          status: input.status,
          orderTax: new Prisma.Decimal(input.orderTax),
          discount: input.totals.discount,
          shipping: input.totals.shipping,
          grandTotal: input.totals.grandTotal,
          due: input.totals.grandTotal.minus(existingReturn.paid),
          notes: input.notes,
          items: {
            deleteMany: {},
            create: itemData,
          },
        },
      });
      return;
    }

    const reference = `PR_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const purchaseReturn = await transaction.purchaseReturn.create({
      data: {
        reference,
        warehouseId: warehouse.id,
        supplierId: supplier.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.totals.discount,
        shipping: input.totals.shipping,
        grandTotal: input.totals.grandTotal,
        paid: new Prisma.Decimal(0),
        due: input.totals.grandTotal,
        paymentType: "Cash",
        notes: input.notes,
        items: { create: itemData },
      },
      select: { id: true },
    });

    if (input.status === "Received") {
      for (const item of input.items) {
        const product = productById.get(item.productId);
        if (!product) throw new Error("One or more selected products are no longer available.");
        await applyStockAdjustment(transaction, {
          productId: product.id,
          productName: product.name,
          warehouseId: warehouse.id,
          quantity: item.quantity,
          type: "Subtraction",
          documentLabel: "purchase return",
          movement: {
            type: "PurchaseReturn",
            sourceType: "PurchaseReturn",
            sourceId: purchaseReturn.id,
            actorId: input.actorId,
          },
        });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function deletePurchaseReturn(id: string, actorId: string): Promise<void> {
  await db.$transaction(async (transaction) => {
    const purchaseReturn = await transaction.purchaseReturn.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        warehouseId: true,
        status: true,
        items: {
          select: {
            quantity: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!purchaseReturn) {
      throw new Error("This purchase return no longer exists or has already been deleted.");
    }

    if (purchaseReturn.status === "Received") {
      const productNameById = new Map(
        purchaseReturn.items.map((item) => [item.product.id, item.product.name]),
      );
      const stockDeltas = calculatePurchaseReturnDeleteStockDeltas({
        warehouseId: purchaseReturn.warehouseId,
        status: purchaseReturn.status,
        items: purchaseReturn.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      });
      for (const delta of stockDeltas) {
        const currentStock = await transaction.productStock.findUnique({
          where: {
            productId_warehouseId: {
              productId: delta.productId,
              warehouseId: purchaseReturn.warehouseId,
            },
          },
          select: { quantity: true },
        });
        const restoredQuantity = (currentStock?.quantity ?? new Prisma.Decimal(0))
          .plus(delta.quantity);
        if (restoredQuantity.greaterThan(new Prisma.Decimal("999999999.999"))) {
          throw new StockQuantityLimitError();
        }

        // Deleting a received return undoes its outbound movement, so restore the stock.
        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName: productNameById.get(delta.productId) ?? "product",
          warehouseId: purchaseReturn.warehouseId,
          quantity: delta.quantity.toString(),
          type: delta.type,
          documentLabel: "purchase return deletion",
          movement: {
            type: "Reconciliation",
            sourceType: "PurchaseReturn",
            sourceId: purchaseReturn.id,
            actorId,
          },
        });
      }
    }

    const deleted = await transaction.purchaseReturn.updateMany({
      where: { id: purchaseReturn.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (deleted.count !== 1) {
      throw new Error("This purchase return no longer exists or has already been deleted.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
