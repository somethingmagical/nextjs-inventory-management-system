import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  applyStockAdjustment,
  InsufficientStockError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import { calculateSaleStockDeltas } from "@/lib/sale-stock";

type SaleItemInput = {
  productId: string;
  price: string;
  quantity: string;
  unit: string;
  discountType: "Fixed" | "Percentage";
  discount: string;
  taxType: "Inclusive" | "Exclusive";
  orderTax: string;
};

type SaleInput = {
  warehouseId: string;
  customerId: string;
  date: string;
  status: "Pending" | "Ordered" | "Received";
  orderTax: string;
  discount: Prisma.Decimal;
  shipping: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  notes: string | null;
  items: SaleItemInput[];
  lineSubtotals: Prisma.Decimal[];
  actorId: string;
};

export async function createSale(input: SaleInput & {
  paid: Prisma.Decimal;
  due: Prisma.Decimal;
  paymentStatus: "Unpaid" | "Paid" | "Partial";
  paymentType: string;
}) {
  return db.$transaction(async (transaction) => {
    const [warehouse, customer, products] = await Promise.all([
      transaction.warehouse.findFirst({
        where: { id: input.warehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
        select: { id: true },
      }),
      transaction.product.findMany({
        where: {
          id: { in: input.items.map((item) => item.productId) },
          deletedAt: null,
        },
        select: { id: true, name: true, productUnit: true },
      }),
    ]);

    if (!warehouse) throw new Error("The selected warehouse is no longer available.");
    if (!customer) throw new Error("The selected customer is no longer available.");
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
        throw new Error("One or more selected sale units are no longer available.");
      }
    }

    const reference = `SA_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const sale = await transaction.sale.create({
      data: {
        reference,
        warehouseId: warehouse.id,
        customerId: customer.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        paid: input.paid,
        due: input.due,
        paymentStatus: input.paymentStatus,
        paymentType: input.paymentType,
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
      select: { id: true, reference: true },
    });

    if (!input.paid.isZero()) {
      await transaction.salePayment.create({
        data: {
          saleId: sale.id,
          amount: input.paid,
          paymentType: input.paymentType,
          date: new Date(`${input.date}T00:00:00.000Z`),
        },
      });
    }

    for (const item of input.items) {
      const product = productById.get(item.productId);
      if (!product) throw new Error("One or more selected products are no longer available.");
      await applyStockAdjustment(transaction, {
        productId: product.id,
        productName: product.name,
        warehouseId: warehouse.id,
        quantity: item.quantity,
        type: "Subtraction",
        documentLabel: "sale",
        movement: {
          type: "Sale",
          sourceType: "Sale",
          sourceId: sale.id,
          actorId: input.actorId,
        },
      });
    }
    return sale;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function updateSale(input: SaleInput & {
  id: string;
  paymentType: string;
}) {
  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  return db.$transaction(async (transaction) => {
    const [warehouse, customer, products, existingSale] = await Promise.all([
      transaction.warehouse.findFirst({
        where: { id: input.warehouseId, deletedAt: null },
        select: { id: true },
      }),
      transaction.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
        select: { id: true },
      }),
      transaction.product.findMany({
        where: {
          id: { in: input.items.map((item) => item.productId) },
          deletedAt: null,
        },
        select: { id: true, name: true, productUnit: true },
      }),
      transaction.sale.findFirst({
        where: { id: input.id, deletedAt: null },
        select: {
          id: true,
          warehouseId: true,
          grandTotal: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    if (!warehouse) throw new Error("The selected warehouse is no longer available.");
    if (!customer) throw new Error("The selected customer is no longer available.");
    if (!existingSale) throw new Error("This sale no longer exists or has already been deleted.");
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
        throw new Error("One or more selected sale units are no longer available.");
      }
    }

    // Reconcile only the old/new quantity difference, preserving prior sale payments.
    const stockDeltas = calculateSaleStockDeltas(
      {
        warehouseId: existingSale.warehouseId,
        items: existingSale.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
      {
        warehouseId: warehouse.id,
        items: input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
    );
    const previousProductNames = new Map(
      existingSale.items.map((item) => [item.productId, item.product.name]),
    );

    for (const delta of stockDeltas) {
      const product = productById.get(delta.productId);
      await applyStockAdjustment(transaction, {
        productId: delta.productId,
        productName: product?.name ?? previousProductNames.get(delta.productId) ?? "product",
        warehouseId: delta.warehouseId,
        quantity: delta.quantity.toString(),
        type: delta.type,
        documentLabel: "sale edit",
        movement: {
          type: "Reconciliation",
          sourceType: "Sale",
          sourceId: existingSale.id,
          actorId: input.actorId,
        },
      });
    }

    const payments = await transaction.salePayment.aggregate({
      where: { saleId: existingSale.id },
      _sum: { amount: true },
    });
    const paid = payments._sum.amount ?? new Prisma.Decimal(0);
    if (paid.greaterThan(maxStoredMoney)) {
      throw new Error("Total payments exceed the supported amount.");
    }
    const due = Prisma.Decimal.max(input.grandTotal.minus(paid), new Prisma.Decimal(0));
    const paymentStatus = paid.isZero()
      ? "Unpaid"
      : paid.greaterThanOrEqualTo(input.grandTotal)
        ? "Paid"
        : "Partial";

    await transaction.sale.update({
      where: { id: existingSale.id },
      data: {
        warehouseId: warehouse.id,
        customerId: customer.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        status: input.status,
        orderTax: new Prisma.Decimal(input.orderTax),
        discount: input.discount,
        shipping: input.shipping,
        grandTotal: input.grandTotal,
        paid,
        due,
        paymentStatus,
        paymentType: input.paymentType,
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

export async function deleteSale(id: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const sale = await transaction.sale.findFirst({
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

    if (!sale) {
      throw new Error("This sale no longer exists or has already been deleted.");
    }

    // Deleting a sale returns the sold goods to the warehouse inventory.
    for (const item of sale.items) {
      await applyStockAdjustment(transaction, {
        productId: item.productId,
        productName: item.product.name,
        warehouseId: sale.warehouseId,
        quantity: item.quantity.toString(),
        type: "Addition",
        documentLabel: "sale deletion",
        movement: {
          type: "Reconciliation",
          sourceType: "Sale",
          sourceId: sale.id,
          actorId,
        },
      });
    }

    const updated = await transaction.sale.updateMany({
      where: { id: sale.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new Error("This sale could not be deleted. Refresh and try again.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export { InsufficientStockError, StockQuantityLimitError };
