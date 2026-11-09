import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  applyStockAdjustment,
  InsufficientStockError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import { calculateSaleReturnStockDeltas } from "@/lib/sale-return-stock";

type SaleReturnItemInput = {
  productId: string;
  price: string;
  quantity: string;
  unit: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Inclusive" | "Exclusive";
  orderTax: string;
};

type SaleReturnInput = {
  saleId: string;
  date: string;
  status: "Pending" | "Ordered" | "Received";
  orderTax: string;
  discount: Prisma.Decimal;
  shipping: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  notes: string | null;
  items: SaleReturnItemInput[];
  lineSubtotals: Prisma.Decimal[];
  actorId: string;
};

export class SaleReturnCreateError extends Error {}

export class SaleReturnUpdateError extends Error {}

export async function createSaleReturn(input: SaleReturnInput) {
  return db.$transaction(async (transaction) => {
    const sale = await transaction.sale.findFirst({
      where: { id: input.saleId, deletedAt: null },
      select: {
        id: true,
        customerId: true,
        warehouseId: true,
        customer: { select: { deletedAt: true } },
        warehouse: { select: { deletedAt: true } },
        items: {
          select: {
            productId: true,
            quantity: true,
            unit: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!sale || sale.customer.deletedAt || sale.warehouse.deletedAt) {
      throw new SaleReturnCreateError("The original sale is no longer available.");
    }

    const saleItemsByProductId = new Map(
      sale.items.map((item) => [item.productId, item]),
    );
    if (input.items.some((item) => !saleItemsByProductId.has(item.productId))) {
      throw new SaleReturnCreateError("Sale returns can only include products from the original sale.");
    }

    const priorReturns = await transaction.saleReturn.findMany({
      where: { saleId: sale.id, deletedAt: null },
      select: {
        items: { select: { productId: true, quantity: true } },
      },
    });
    const previouslyReturned = new Map<string, Prisma.Decimal>();
    for (const saleReturn of priorReturns) {
      for (const item of saleReturn.items) {
        previouslyReturned.set(
          item.productId,
          (previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity),
        );
      }
    }

    for (const item of input.items) {
      const saleItem = saleItemsByProductId.get(item.productId);
      if (!saleItem) {
        throw new SaleReturnCreateError("Sale returns can only include products from the original sale.");
      }

      const returnQuantity = new Prisma.Decimal(item.quantity);
      const totalReturning = (previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0))
        .plus(returnQuantity);
      if (totalReturning.greaterThan(saleItem.quantity)) {
        throw new SaleReturnCreateError(
          `Returned quantity for ${saleItem.product.name} cannot exceed the quantity sold (${saleItem.quantity.toString()}).`,
        );
      }

      if (item.unit !== saleItem.unit) {
        const unit = await transaction.unit.findFirst({
          where: { name: item.unit, deletedAt: null },
          select: { name: true },
        });
        if (!unit) {
          throw new SaleReturnCreateError("One or more selected sale return units are no longer available.");
        }
      }
    }

    const reference = `SR_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const createdReturn = await transaction.saleReturn.create({
      data: {
        reference,
        customerId: sale.customerId,
        warehouseId: sale.warehouseId,
        saleId: sale.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        paid: new Prisma.Decimal(0),
        due: input.grandTotal,
        paymentStatus: "Unpaid",
        notes: input.notes,
        items: {
          create: input.items.map((item, index) => ({
            productId: item.productId,
            netUnitPrice: new Prisma.Decimal(item.price),
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

    for (const item of input.items) {
      const saleItem = saleItemsByProductId.get(item.productId);
      if (!saleItem) {
        throw new SaleReturnCreateError("Sale returns can only include products from the original sale.");
      }
      await applyStockAdjustment(transaction, {
        productId: saleItem.productId,
        productName: saleItem.product.name,
        warehouseId: sale.warehouseId,
        quantity: item.quantity,
        type: "Addition",
        documentLabel: "sale return",
        movement: {
          type: "SaleReturn",
          sourceType: "SaleReturn",
          sourceId: createdReturn.id,
          actorId: input.actorId,
        },
      });
    }

    return createdReturn.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function updateSaleReturn(input: SaleReturnInput & {
  id: string;
}) {
  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  return db.$transaction(async (transaction) => {
    const existingReturn = await transaction.saleReturn.findFirst({
      where: { id: input.id, deletedAt: null },
      select: {
        id: true,
        saleId: true,
        warehouseId: true,
        paid: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
    if (!existingReturn) {
      throw new SaleReturnUpdateError("This sale return no longer exists or has already been deleted.");
    }
    if (!existingReturn.saleId || existingReturn.saleId !== input.saleId) {
      throw new SaleReturnUpdateError("The original sale for this return is no longer available.");
    }

    const sale = await transaction.sale.findFirst({
      where: { id: existingReturn.saleId, deletedAt: null },
      select: {
        id: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            unit: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!sale) {
      throw new SaleReturnUpdateError("The original sale is no longer available.");
    }

    const saleItemsByProductId = new Map<string, {
      quantity: Prisma.Decimal;
      unit: string;
      productName: string;
    }>();
    for (const saleItem of sale.items) {
      const existing = saleItemsByProductId.get(saleItem.productId);
      saleItemsByProductId.set(saleItem.productId, {
        quantity: (existing?.quantity ?? new Prisma.Decimal(0)).plus(saleItem.quantity),
        unit: saleItem.unit,
        productName: saleItem.product.name,
      });
    }

    const priorReturns = await transaction.saleReturn.findMany({
      where: {
        saleId: sale.id,
        deletedAt: null,
        id: { not: existingReturn.id },
      },
      select: { items: { select: { productId: true, quantity: true } } },
    });
    const previouslyReturned = new Map<string, Prisma.Decimal>();
    for (const saleReturn of priorReturns) {
      for (const item of saleReturn.items) {
        previouslyReturned.set(
          item.productId,
          (previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity),
        );
      }
    }

    const customUnits = new Set<string>();
    for (const item of input.items) {
      const saleItem = saleItemsByProductId.get(item.productId);
      if (!saleItem) {
        throw new SaleReturnUpdateError("Sale returns can only include products from the original sale.");
      }
      const returnQuantity = new Prisma.Decimal(item.quantity);
      if ((previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0))
        .plus(returnQuantity).greaterThan(saleItem.quantity)) {
        throw new SaleReturnUpdateError(
          `Returned quantity for ${saleItem.productName} cannot exceed the remaining quantity available from the sale.`,
        );
      }
      if (item.unit !== saleItem.unit) customUnits.add(item.unit);
    }

    if (customUnits.size > 0) {
      const activeUnits = await transaction.unit.findMany({
        where: { name: { in: Array.from(customUnits) }, deletedAt: null },
        select: { name: true },
      });
      const activeUnitNames = new Set(activeUnits.map((unit) => unit.name));
      if (Array.from(customUnits).some((unit) => !activeUnitNames.has(unit))) {
        throw new SaleReturnUpdateError("One or more selected sale return units are no longer available.");
      }
    }

    // Applying the full replacement return would double-count already returned stock.
    const stockDeltas = calculateSaleReturnStockDeltas(
      existingReturn.items,
      input.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    );
    for (const delta of stockDeltas) {
      const saleItem = saleItemsByProductId.get(delta.productId);
      if (!saleItem) {
        throw new SaleReturnUpdateError("The original sale no longer contains a returned product.");
      }
      await applyStockAdjustment(transaction, {
        productId: delta.productId,
        productName: saleItem.productName,
        warehouseId: existingReturn.warehouseId,
        quantity: delta.quantity.toString(),
        type: delta.type,
        documentLabel: "sale return edit",
        movement: {
          type: "Reconciliation",
          sourceType: "SaleReturn",
          sourceId: existingReturn.id,
          actorId: input.actorId,
        },
      });
    }

    const paid = existingReturn.paid;
    if (paid.greaterThan(maxStoredMoney)) {
      throw new SaleReturnUpdateError("The recorded refund exceeds the supported amount.");
    }
    const due = Prisma.Decimal.max(input.grandTotal.minus(paid), new Prisma.Decimal(0));
    const paymentStatus = paid.isZero()
      ? "Unpaid"
      : paid.greaterThanOrEqualTo(input.grandTotal)
        ? "Paid"
        : "Partial";

    await transaction.saleReturn.update({
      where: { id: existingReturn.id },
      data: {
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        paid,
        due,
        paymentStatus,
        notes: input.notes,
        items: {
          deleteMany: {},
          create: input.items.map((item, index) => ({
            productId: item.productId,
            netUnitPrice: new Prisma.Decimal(item.price),
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
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function deleteSaleReturn(id: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const saleReturn = await transaction.saleReturn.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        warehouseId: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!saleReturn) {
      throw new SaleReturnUpdateError("This sale return no longer exists or has already been deleted.");
    }

    // Deleting a return removes goods previously added back to inventory.
    for (const item of saleReturn.items) {
      await applyStockAdjustment(transaction, {
        productId: item.productId,
        productName: item.product.name,
        warehouseId: saleReturn.warehouseId,
        quantity: item.quantity.toString(),
        type: "Subtraction",
        documentLabel: "sale return deletion",
        movement: {
          type: "Reconciliation",
          sourceType: "SaleReturn",
          sourceId: saleReturn.id,
          actorId,
        },
      });
    }

    const updated = await transaction.saleReturn.updateMany({
      where: { id: saleReturn.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new SaleReturnUpdateError("This sale return could not be deleted. Refresh and try again.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export {
  InsufficientStockError,
  StockQuantityLimitError,
};
