import "server-only";

import { Prisma, type AdjustmentType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  applyStockAdjustment,
  StockBalanceChangedError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import { calculateStockQuantityAdjustment } from "./stock/quantity-adjustment";

export class WarehouseStockEditError extends Error {}

export async function createAdjustment(input: {
  warehouseId: string;
  date: string;
  actorId: string;
  items: { productId: string; quantity: string; type: AdjustmentType }[];
}) {
  return db.$transaction(async (transaction) => {
    const warehouse = await transaction.warehouse.findFirst({
      where: { id: input.warehouseId, deletedAt: null },
      select: { id: true },
    });
    if (!warehouse) {
      throw new Error("The selected warehouse is no longer available.");
    }

    const productIds = input.items.map((item) => item.productId);
    const products = await transaction.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, name: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    if (products.length !== productIds.length) {
      throw new Error("One or more selected products are no longer available.");
    }

    const reference = `ADJ_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const adjustment = await transaction.adjustment.create({
      data: {
        reference,
        warehouseId: warehouse.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: new Prisma.Decimal(item.quantity),
            type: item.type,
          })),
        },
      },
      select: { id: true },
    });

    for (const item of input.items) {
      const product = productById.get(item.productId);
      if (!product) {
        throw new Error("One or more selected products are no longer available.");
      }
      await applyStockAdjustment(transaction, {
        productId: product.id,
        productName: product.name,
        warehouseId: warehouse.id,
        quantity: item.quantity,
        type: item.type,
        movement: {
          type: "Adjustment",
          sourceType: "Adjustment",
          sourceId: adjustment.id,
          actorId: input.actorId,
        },
      });
    }

    return adjustment.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function setWarehouseStockQuantity(input: {
  productId: string;
  warehouseId: string;
  expectedQuantity: Prisma.Decimal;
  targetQuantity: Prisma.Decimal;
  date: string;
  actorId: string;
}) {
  const maxQuantity = new Prisma.Decimal("999999999.999");
  if (
    input.targetQuantity.isNegative()
    || input.targetQuantity.greaterThan(maxQuantity)
  ) {
    throw new StockQuantityLimitError();
  }

  return db.$transaction(async (transaction) => {
    const [product, warehouse] = await Promise.all([
      transaction.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true, name: true },
      }),
      transaction.warehouse.findFirst({
        where: { id: input.warehouseId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!product || !warehouse) {
      throw new WarehouseStockEditError(
        "The product or warehouse is no longer available.",
      );
    }

    const existingStock = await transaction.productStock.findUnique({
      where: {
        productId_warehouseId: {
          productId: product.id,
          warehouseId: warehouse.id,
        },
      },
      select: { quantity: true },
    });
    const currentQuantity = existingStock?.quantity ?? new Prisma.Decimal(0);
    if (!currentQuantity.equals(input.expectedQuantity)) {
      throw new StockBalanceChangedError();
    }

    const adjustmentDelta = calculateStockQuantityAdjustment(
      currentQuantity,
      input.targetQuantity,
    );
    if (!adjustmentDelta) return null;

    const adjustment = await transaction.adjustment.create({
      data: {
        reference: `ADJ_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        warehouseId: warehouse.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        items: {
          create: {
            productId: product.id,
            quantity: adjustmentDelta.quantity,
            type: adjustmentDelta.type,
          },
        },
      },
      select: { id: true },
    });

    await applyStockAdjustment(transaction, {
      productId: product.id,
      productName: product.name,
      warehouseId: warehouse.id,
      quantity: adjustmentDelta.quantity.toString(),
      type: adjustmentDelta.type,
      expectedQuantity: currentQuantity,
      movement: {
        type: "Adjustment",
        sourceType: "Adjustment",
        sourceId: adjustment.id,
        actorId: input.actorId,
      },
    });

    return adjustment.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function deleteAdjustment(id: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const adjustment = await transaction.adjustment.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        warehouseId: true,
        items: {
          select: {
            quantity: true,
            type: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!adjustment) {
      throw new Error("This adjustment no longer exists or has already been deleted.");
    }

    for (const item of adjustment.items) {
      const type: AdjustmentType = item.type === "Addition" ? "Subtraction" : "Addition";
      await applyStockAdjustment(transaction, {
        productId: item.product.id,
        productName: item.product.name,
        warehouseId: adjustment.warehouseId,
        quantity: item.quantity.toString(),
        type,
        movement: {
          type: "Reconciliation",
          sourceType: "Adjustment",
          sourceId: adjustment.id,
          actorId,
        },
      });
    }

    const updated = await transaction.adjustment.updateMany({
      where: { id: adjustment.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new Error("This adjustment could not be deleted. Refresh and try again.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
