import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  applyStockBucketAdjustment,
  applyStockAdjustment,
  receivePurchaseStock,
} from "@/lib/product-stock";
import { calculatePurchaseStockDeltas } from "@/lib/purchase-stock";
import { getStockConversionFactor, toStockQuantity } from "@/lib/product-unit-conversions";
import { getInitialPurchaseDeliveryStatus } from "./purchase-delivery-status";

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

type PurchaseInput = {
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
};

type ResolvedPurchaseInput = Omit<PurchaseInput, "items"> & {
  items: (PurchaseItemInput & { stockConversionFactor: string })[];
};

function createPurchaseItems(input: ResolvedPurchaseInput) {
  return input.items.map((item, index) => ({
    productId: item.productId,
    netUnitCost: new Prisma.Decimal(item.netUnitCost),
    quantity: new Prisma.Decimal(item.quantity),
    unit: item.unit,
    discountType: item.discountType,
    discount: new Prisma.Decimal(item.discount),
    taxType: item.taxType,
    orderTax: new Prisma.Decimal(item.orderTax),
    subtotal: input.lineSubtotals[index],
    stockConversionFactor: new Prisma.Decimal(item.stockConversionFactor),
  }));
}

async function validatePurchaseReferences(
  transaction: Prisma.TransactionClient,
  input: PurchaseInput,
) {
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
      select: {
        id: true,
        name: true,
        productUnit: true,
        unitConversions: {
          where: { unit: { deletedAt: null } },
          select: { conversionFactor: true, unit: { select: { name: true } } },
        },
      },
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

  const resolvedItems = input.items.map((item) => {
    const product = productById.get(item.productId);
    if (!product) throw new Error("One or more selected products are no longer available.");
    const factor = getStockConversionFactor(product, item.unit);
    toStockQuantity(item.quantity, factor);
    return { ...item, stockConversionFactor: factor.toString() };
  });
  return { warehouse, supplier, productById, resolvedItems };
}

export async function createPurchase(input: PurchaseInput) {
  return db.$transaction(async (transaction) => {
    const { warehouse, supplier, resolvedItems } = await validatePurchaseReferences(
      transaction,
      input,
    );
    const purchaseInput = { ...input, items: resolvedItems };

    const reference = `PU_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const purchase = await transaction.purchase.create({
      data: {
        reference,
        warehouseId: warehouse.id,
        supplierId: supplier.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        deliveryStatus: getInitialPurchaseDeliveryStatus(input.status),
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        notes: input.notes,
        items: { create: createPurchaseItems(purchaseInput) },
      },
      select: { id: true },
    });

    for (const item of resolvedItems) {
      const quantity = toStockQuantity(item.quantity, item.stockConversionFactor).toString();
      if (input.status === "Received") {
        await receivePurchaseStock(transaction, {
          productId: item.productId,
          warehouseId: warehouse.id,
          supplierId: supplier.id,
          quantity,
          movement: {
            type: "PurchaseReceipt",
            sourceType: "Purchase",
            sourceId: purchase.id,
            actorId: input.actorId,
          },
        });
      } else {
        await applyStockBucketAdjustment(transaction, {
          productId: item.productId,
          warehouseId: warehouse.id,
          status: input.status,
          quantity,
          type: "Addition",
          supplierId: supplier.id,
        });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function updatePurchase(input: PurchaseInput & { id: string }) {
  return db.$transaction(async (transaction) => {
    const [references, existingPurchase] = await Promise.all([
      validatePurchaseReferences(transaction, input),
      transaction.purchase.findFirst({
        where: { id: input.id, deletedAt: null },
        select: {
          id: true,
          warehouseId: true,
          status: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              unit: true,
              stockConversionFactor: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    if (!existingPurchase) {
      throw new Error("This purchase no longer exists or has already been deleted.");
    }

    const resolvedItems = references.resolvedItems.map((item) => {
      const previousItem = existingPurchase.items.find((previous) =>
        previous.productId === item.productId && previous.unit === item.unit,
      );
      const factor = previousItem?.stockConversionFactor ?? item.stockConversionFactor;
      toStockQuantity(item.quantity, factor);
      return { ...item, stockConversionFactor: factor.toString() };
    });
    const stockDeltas = calculatePurchaseStockDeltas(
      {
        warehouseId: existingPurchase.warehouseId,
        status: existingPurchase.status,
        items: existingPurchase.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          stockConversionFactor: item.stockConversionFactor,
        })),
      },
      {
        warehouseId: references.warehouse.id,
        status: input.status,
        items: resolvedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          stockConversionFactor: item.stockConversionFactor,
        })),
      },
    );
    const previousProductNames = new Map(
      existingPurchase.items.map((item) => [item.productId, item.product.name]),
    );

    for (const delta of stockDeltas) {
      const product = references.productById.get(delta.productId);
      if (delta.status === "Received") {
        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName:
            product?.name ?? previousProductNames.get(delta.productId) ?? "product",
          warehouseId: delta.warehouseId,
          quantity: delta.quantity.toString(),
          type: delta.type,
          documentLabel: "purchase edit",
          movement: {
            type: "Reconciliation",
            sourceType: "Purchase",
            sourceId: existingPurchase.id,
            actorId: input.actorId,
          },
        });
      } else {
        await applyStockBucketAdjustment(transaction, {
          productId: delta.productId,
          warehouseId: delta.warehouseId,
          status: delta.status,
          quantity: delta.quantity.toString(),
          type: delta.type,
          supplierId: references.supplier.id,
        });
      }
    }

    await transaction.purchase.update({
      where: { id: existingPurchase.id },
      data: {
        warehouseId: references.warehouse.id,
        supplierId: references.supplier.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        notes: input.notes,
        items: {
          deleteMany: {},
          create: createPurchaseItems({ ...input, items: resolvedItems }),
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
