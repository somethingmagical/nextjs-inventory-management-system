import "server-only";

import {
  Prisma,
  type ProductTaxType,
  type PurchaseDiscountType,
  type TransferStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { applyStockAdjustment, InsufficientStockError } from "@/lib/product-stock";
import {
  calculateTransferDeleteStockDeltas,
  calculateTransferStockDeltas,
  getTransferStockOperations,
  type TransferStockSnapshot,
} from "@/lib/transfer-stock";

type TransferWriteData = {
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  status: TransferStatus;
  orderTax: string;
  discount: string;
  shipping: string;
  notes: string | null;
  items: {
    productId: string;
    netUnitCost: string;
    quantity: string;
    discountType: PurchaseDiscountType;
    discount: string;
    taxType: ProductTaxType;
    orderTax: string;
  }[];
};

type TransferWriteTotals = {
  lineSubtotals: Prisma.Decimal[];
  discount: Prisma.Decimal;
  shipping: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
};

export async function createTransferRecord(input: {
  transfer: TransferWriteData;
  actorId: string;
} & TransferWriteTotals) {
  await db.$transaction(async (transaction) => {
    const [fromWarehouse, toWarehouse, products, sourceStocks] = await Promise.all([
      transaction.warehouse.findFirst({
        where: { id: input.transfer.fromWarehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.warehouse.findFirst({
        where: { id: input.transfer.toWarehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.product.findMany({
        where: {
          id: { in: input.transfer.items.map((item) => item.productId) },
          deletedAt: null,
        },
        select: { id: true, name: true },
      }),
      transaction.productStock.findMany({
        where: {
          warehouseId: input.transfer.fromWarehouseId,
          productId: { in: input.transfer.items.map((item) => item.productId) },
        },
        select: { productId: true, quantity: true },
      }),
    ]);

    if (!fromWarehouse) throw new Error("The selected source warehouse is no longer available.");
    if (!toWarehouse) throw new Error("The selected destination warehouse is no longer available.");
    if (fromWarehouse.id === toWarehouse.id) {
      throw new Error("Source and destination warehouses must be different.");
    }
    if (products.length !== input.transfer.items.length) {
      throw new Error("One or more selected products are no longer available.");
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    const stockByProductId = new Map(sourceStocks.map((stock) => [stock.productId, stock.quantity]));
    for (const item of input.transfer.items) {
      const sourceStock = stockByProductId.get(item.productId);
      const quantity = new Prisma.Decimal(item.quantity);
      if (!sourceStock || sourceStock.lessThan(quantity)) {
        throw new InsufficientStockError(
          productById.get(item.productId)?.name,
          "transfer",
        );
      }
    }

    const reference = `TR_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const transfer = await transaction.transfer.create({
      data: {
        reference,
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
        date: new Date(`${input.transfer.date}T00:00:00.000Z`),
        status: input.transfer.status,
        orderTax: new Prisma.Decimal(input.transfer.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        notes: input.transfer.notes,
        items: {
          create: input.transfer.items.map((item, index) => ({
            productId: item.productId,
            netUnitCost: new Prisma.Decimal(item.netUnitCost),
            quantity: new Prisma.Decimal(item.quantity),
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

    for (const item of input.transfer.items) {
      for (const operation of getTransferStockOperations(input.transfer.status)) {
        const product = productById.get(item.productId);
        if (!product) throw new Error("One or more selected products are no longer available.");

        await applyStockAdjustment(transaction, {
          productId: item.productId,
          productName: product.name,
          warehouseId: operation.warehouse === "from" ? fromWarehouse.id : toWarehouse.id,
          quantity: item.quantity,
          type: operation.type,
          documentLabel: "transfer",
          movement: {
            type: "Transfer",
            sourceType: "Transfer",
            sourceId: transfer.id,
            actorId: input.actorId,
          },
        });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function updateTransferRecord(input: {
  id: string;
  transfer: TransferWriteData;
  actorId: string;
} & TransferWriteTotals) {
  await db.$transaction(async (transaction) => {
    const original = await transaction.transfer.findFirst({
      where: { id: input.id, deletedAt: null },
      select: {
        id: true,
        fromWarehouseId: true,
        toWarehouseId: true,
        status: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
    if (!original) throw new Error("This transfer is invalid or no longer available.");

    const [fromWarehouse, toWarehouse, products] = await Promise.all([
      transaction.warehouse.findFirst({
        where: { id: input.transfer.fromWarehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.warehouse.findFirst({
        where: { id: input.transfer.toWarehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.product.findMany({
        where: {
          id: { in: input.transfer.items.map((item) => item.productId) },
          deletedAt: null,
        },
        select: { id: true, name: true },
      }),
    ]);

    if (!fromWarehouse) throw new Error("The selected source warehouse is no longer available.");
    if (!toWarehouse) throw new Error("The selected destination warehouse is no longer available.");
    if (fromWarehouse.id === toWarehouse.id) {
      throw new Error("Source and destination warehouses must be different.");
    }
    if (products.length !== input.transfer.items.length) {
      throw new Error("One or more selected products are no longer available.");
    }

    const originalSnapshot: TransferStockSnapshot = {
      fromWarehouseId: original.fromWarehouseId,
      toWarehouseId: original.toWarehouseId,
      status: original.status,
      items: original.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity.toString(),
      })),
    };
    const updatedSnapshot: TransferStockSnapshot = {
      fromWarehouseId: fromWarehouse.id,
      toWarehouseId: toWarehouse.id,
      status: input.transfer.status,
      items: input.transfer.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    };
    const stockDeltas = calculateTransferStockDeltas(originalSnapshot, updatedSnapshot);
    const productById = new Map(products.map((product) => [product.id, product]));

    for (const delta of stockDeltas) {
      if (delta.type !== "Subtraction") continue;
      const product = productById.get(delta.productId);
      if (!product) throw new Error("One or more selected products are no longer available.");

      await applyStockAdjustment(transaction, {
        productId: delta.productId,
        productName: product.name,
        warehouseId: delta.warehouseId,
        quantity: delta.quantity,
        type: delta.type,
        documentLabel: "transfer edit",
        movement: {
          type: "Reconciliation",
          sourceType: "Transfer",
          sourceId: original.id,
          actorId: input.actorId,
        },
      });
    }
    for (const delta of stockDeltas) {
      if (delta.type !== "Addition") continue;
      const product = productById.get(delta.productId);
      if (!product) throw new Error("One or more selected products are no longer available.");

      await applyStockAdjustment(transaction, {
        productId: delta.productId,
        productName: product.name,
        warehouseId: delta.warehouseId,
        quantity: delta.quantity,
        type: delta.type,
        documentLabel: "transfer edit",
        movement: {
          type: "Reconciliation",
          sourceType: "Transfer",
          sourceId: original.id,
          actorId: input.actorId,
        },
      });
    }

    await transaction.transfer.update({
      where: { id: original.id },
      data: {
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
        date: new Date(`${input.transfer.date}T00:00:00.000Z`),
        status: input.transfer.status,
        orderTax: new Prisma.Decimal(input.transfer.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        notes: input.transfer.notes,
        items: {
          deleteMany: {},
          create: input.transfer.items.map((item, index) => ({
            productId: item.productId,
            netUnitCost: new Prisma.Decimal(item.netUnitCost),
            quantity: new Prisma.Decimal(item.quantity),
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

export async function deleteTransferRecord(id: string, actorId: string) {
  await db.$transaction(async (transaction) => {
    const transfer = await transaction.transfer.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        fromWarehouseId: true,
        toWarehouseId: true,
        status: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!transfer) {
      throw new Error("This transfer no longer exists or has already been deleted.");
    }

    const stockDeltas = calculateTransferDeleteStockDeltas({
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      status: transfer.status,
      items: transfer.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity.toString(),
      })),
    });
    const productNameById = new Map(
      transfer.items.map((item) => [item.productId, item.product.name]),
    );

    for (const delta of stockDeltas) {
      await applyStockAdjustment(transaction, {
        productId: delta.productId,
        productName: productNameById.get(delta.productId) ?? "product",
        warehouseId: delta.warehouseId,
        quantity: delta.quantity,
        type: delta.type,
        documentLabel: "transfer deletion",
        movement: {
          type: "Reconciliation",
          sourceType: "Transfer",
          sourceId: transfer.id,
          actorId,
        },
      });
    }

    const deleted = await transaction.transfer.updateMany({
      where: { id: transfer.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (deleted.count !== 1) {
      throw new Error("This transfer could not be deleted. Refresh and try again.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
