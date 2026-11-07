"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import {
  applyStockAdjustment,
  InsufficientStockError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import { calculateSaleStockDeltas } from "@/lib/sale-stock";
import { getSaleAccess } from "../authorization";
import { saleCreateSchema } from "../sale-create-schema";
import { saleIdSchema } from "../[id]/payments/payment-schema";
import type { SaleCreateActionState } from "./action-state";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";

const productSearchSchema = z.object({
  warehouseId: z.string().trim().min(1).max(191),
  query: z.string().trim().min(2).max(120),
});

export type SaleProductSearchResult =
  | {
      status: "success";
      products: {
        id: string;
        code: string;
        name: string;
        price: string;
        unit: string;
        stock: string;
      }[];
    }
  | { status: "error"; message: string };

export async function createSale(
  _previousState: SaleCreateActionState,
  formData: FormData,
): Promise<SaleCreateActionState> {
  const isPosRequest = formData.get("source") === "pos";
  let access = await getSaleAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a sale." };
  }
  if (access.status === "forbidden" && isPosRequest) {
    access = await requirePermission(PERMISSION.managePosScreen);
  }
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a sale." };
  }
  if (access.status === "forbidden") {
    return {
      status: "error",
      message: isPosRequest
        ? "You do not have permission to manage POS sales."
        : "You do not have permission to manage sales.",
    };
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return { status: "error", message: "Sale items are invalid. Review the products and try again." };
  }

  const parsed = saleCreateSchema.safeParse({
    warehouseId: formData.get("warehouseId"),
    customerId: formData.get("customerId"),
    date: formData.get("date"),
    status: formData.get("status"),
    orderTax: formData.get("orderTax"),
    discount: formData.get("discount"),
    shipping: formData.get("shipping"),
    paid: formData.get("paid"),
    paymentType: formData.get("paymentType"),
    notes: formData.get("notes") || null,
    items,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter valid sale details.",
    };
  }

  const lineTotals: ReturnType<typeof calculatePurchaseLineTotals>[] = [];
  try {
    for (const item of parsed.data.items) {
      lineTotals.push(calculatePurchaseLineTotals({
        unitCost: item.price,
        quantity: item.quantity,
        discountType: item.discountType,
        discount: item.discount,
        taxType: item.taxType,
        taxRate: item.orderTax,
      }));
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid sale line details.",
    };
  }

  let totals: ReturnType<typeof calculatePurchaseTotals>;
  try {
    totals = calculatePurchaseTotals({
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      orderTaxRate: parsed.data.orderTax,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid sale totals.",
    };
  }

  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  const paid = new Prisma.Decimal(parsed.data.paid);
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
    || paid.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Sale totals exceed the supported amount." };
  }

  const due = Prisma.Decimal.max(totals.grandTotal.minus(paid), new Prisma.Decimal(0));
  const paymentStatus = paid.isZero()
    ? "Unpaid"
    : paid.greaterThanOrEqualTo(totals.grandTotal)
      ? "Paid"
      : "Partial";

  let createdSale: { id: string; reference: string } | null = null;
  try {
    createdSale = await db.$transaction(async (transaction) => {
      const [warehouse, customer, products] = await Promise.all([
        transaction.warehouse.findFirst({
          where: { id: parsed.data.warehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.customer.findFirst({
          where: { id: parsed.data.customerId, deletedAt: null },
          select: { id: true },
        }),
        transaction.product.findMany({
          where: {
            id: { in: parsed.data.items.map((item) => item.productId) },
            deletedAt: null,
          },
          select: { id: true, name: true, productUnit: true },
        }),
      ]);

      if (!warehouse) throw new Error("The selected warehouse is no longer available.");
      if (!customer) throw new Error("The selected customer is no longer available.");
      if (products.length !== parsed.data.items.length) {
        throw new Error("One or more selected products are no longer available.");
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      const customUnits = [...new Set(parsed.data.items
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
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          status: parsed.data.status,
          orderTax: new Prisma.Decimal(parsed.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          paid,
          due,
          paymentStatus,
          paymentType: parsed.data.paymentType,
          notes: parsed.data.notes,
          items: {
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId,
              netUnitPrice: new Prisma.Decimal(item.price),
              quantity: new Prisma.Decimal(item.quantity),
              unit: item.unit,
              discountType: item.discountType,
              discount: new Prisma.Decimal(item.discount),
              taxType: item.taxType,
              orderTax: new Prisma.Decimal(item.orderTax),
              subtotal: lineTotals[index].subtotal,
            })),
          },
        },
        select: { id: true, reference: true },
      });

      if (!paid.isZero()) {
        await transaction.salePayment.create({
          data: {
            saleId: sale.id,
            amount: paid,
            paymentType: parsed.data.paymentType,
            date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          },
        });
      }

      for (const item of parsed.data.items) {
        const product = productById.get(item.productId);
        if (!product) throw new Error("One or more selected products are no longer available.");
        await applyStockAdjustment(transaction, {
          productId: product.id,
          productName: product.name,
          warehouseId: warehouse.id,
          quantity: item.quantity,
          type: "Subtraction",
          documentLabel: "sale",
        });
      }
      return sale;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && [
      "The selected warehouse is no longer available.",
      "The selected customer is no longer available.",
      "One or more selected products are no longer available.",
      "One or more selected sale units are no longer available.",
    ].includes(error.message)) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Inventory changed while saving. Refresh the page and try again." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", message: "The sale reference conflicted. Please submit it again." };
    }
    throw error;
  }

  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  revalidatePath("/pos");
  if (isPosRequest) {
    if (!createdSale) throw new Error("The sale was not created successfully.");
    return {
      status: "success",
      message: "Sale created successfully.",
      saleId: createdSale.id,
      reference: createdSale.reference,
    };
  }
  redirect("/sales?created=1");
}

export async function updateSale(
  saleId: string,
  _previousState: SaleCreateActionState,
  formData: FormData,
): Promise<SaleCreateActionState> {
  const access = await getSaleAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before editing a sale." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage sales." };
  }

  const parsedId = z.string().trim().min(1).max(191).safeParse(saleId);
  if (!parsedId.success) {
    return { status: "error", message: "This sale could not be found." };
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return { status: "error", message: "Sale items are invalid. Review the products and try again." };
  }

  const parsed = saleCreateSchema.safeParse({
    warehouseId: formData.get("warehouseId"),
    customerId: formData.get("customerId"),
    date: formData.get("date"),
    status: formData.get("status"),
    orderTax: formData.get("orderTax"),
    discount: formData.get("discount"),
    shipping: formData.get("shipping"),
    paid: "0",
    paymentType: formData.get("paymentType"),
    notes: formData.get("notes") || null,
    items,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter valid sale details.",
    };
  }

  let lineTotals: ReturnType<typeof calculatePurchaseLineTotals>[];
  let totals: ReturnType<typeof calculatePurchaseTotals>;
  try {
    lineTotals = parsed.data.items.map((item) => calculatePurchaseLineTotals({
      unitCost: item.price,
      quantity: item.quantity,
      discountType: item.discountType,
      discount: item.discount,
      taxType: item.taxType,
      taxRate: item.orderTax,
    }));
    totals = calculatePurchaseTotals({
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      orderTaxRate: parsed.data.orderTax,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid sale pricing details.",
    };
  }

  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Sale totals exceed the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const [warehouse, customer, products, existingSale] = await Promise.all([
        transaction.warehouse.findFirst({
          where: { id: parsed.data.warehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.customer.findFirst({
          where: { id: parsed.data.customerId, deletedAt: null },
          select: { id: true },
        }),
        transaction.product.findMany({
          where: {
            id: { in: parsed.data.items.map((item) => item.productId) },
            deletedAt: null,
          },
          select: { id: true, name: true, productUnit: true },
        }),
        transaction.sale.findFirst({
          where: { id: parsedId.data, deletedAt: null },
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
      if (products.length !== parsed.data.items.length) {
        throw new Error("One or more selected products are no longer available.");
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      const customUnits = [...new Set(parsed.data.items
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
          items: parsed.data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      );
      const previousProductNames = new Map(
        existingSale.items.map((item) => [item.productId, item.product.name]),
      );

      // Reconcile only the old/new quantity difference, preserving prior sale payments.
      for (const delta of stockDeltas) {
        const product = productById.get(delta.productId);
        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName: product?.name ?? previousProductNames.get(delta.productId) ?? "product",
          warehouseId: delta.warehouseId,
          quantity: delta.quantity.toString(),
          type: delta.type,
          documentLabel: "sale edit",
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
      const due = Prisma.Decimal.max(totals.grandTotal.minus(paid), new Prisma.Decimal(0));
      const paymentStatus = paid.isZero()
        ? "Unpaid"
        : paid.greaterThanOrEqualTo(totals.grandTotal)
          ? "Paid"
          : "Partial";

      await transaction.sale.update({
        where: { id: existingSale.id },
        data: {
          warehouseId: warehouse.id,
          customerId: customer.id,
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          status: parsed.data.status,
          orderTax: new Prisma.Decimal(parsed.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          paid,
          due,
          paymentStatus,
          paymentType: parsed.data.paymentType,
          notes: parsed.data.notes,
          items: {
            deleteMany: {},
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId,
              netUnitPrice: new Prisma.Decimal(item.price),
              quantity: new Prisma.Decimal(item.quantity),
              unit: item.unit,
              discountType: item.discountType,
              discount: new Prisma.Decimal(item.discount),
              taxType: item.taxType,
              orderTax: new Prisma.Decimal(item.orderTax),
              subtotal: lineTotals[index].subtotal,
            })),
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Inventory changed while saving. Refresh the page and try again." };
    }
    if (error instanceof Error && [
      "The selected warehouse is no longer available.",
      "The selected customer is no longer available.",
      "One or more selected products are no longer available.",
      "One or more selected sale units are no longer available.",
      "This sale no longer exists or has already been deleted.",
      "Total payments exceed the supported amount.",
    ].includes(error.message)) {
      return { status: "error", message: error.message };
    }
    throw error;
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${encodeURIComponent(parsedId.data)}`);
  revalidatePath(`/sales/${encodeURIComponent(parsedId.data)}/payments`);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect(`/sales/${encodeURIComponent(parsedId.data)}?updated=1`);
}

export async function deleteSale(saleId: string): Promise<SaleCreateActionState> {
  const access = await getSaleAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a sale." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage sales." };
  }

  const parsedId = saleIdSchema.safeParse(saleId);
  if (!parsedId.success) {
    return { status: "error", message: "This sale could not be found." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const sale = await transaction.sale.findFirst({
        where: { id: parsedId.data, deletedAt: null },
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
        });
      }

      const updated = await transaction.sale.updateMany({
        where: { id: sale.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new Error("This sale could not be deleted. Refresh and try again.");
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (
      error instanceof Error &&
      (error.message === "This sale no longer exists or has already been deleted." ||
        error.message === "This sale could not be deleted. Refresh and try again.")
    ) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Stock changed while deleting. Refresh and try again." };
    }
    throw error;
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${encodeURIComponent(parsedId.data)}`);
  revalidatePath(`/sales/${encodeURIComponent(parsedId.data)}/payments`);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/sales?deleted=1");
}

export async function searchSaleProducts(
  warehouseId: string,
  query: string,
): Promise<SaleProductSearchResult> {
  const access = await getSaleAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before searching products." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage sales." };
  }

  const parsed = productSearchSchema.safeParse({ warehouseId, query });
  if (!parsed.success) {
    return { status: "error", message: "Choose a warehouse and enter at least 2 search characters." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsed.data.warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      productStocks: {
        some: {
          warehouseId: warehouse.id,
          quantity: { gt: 0 },
        },
      },
      OR: [
        { code: { contains: parsed.data.query } },
        { name: { contains: parsed.data.query } },
      ],
    },
    orderBy: { name: "asc" },
    take: 10,
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      productUnit: true,
      productStocks: {
        where: { warehouseId: warehouse.id },
        select: { quantity: true },
        take: 1,
      },
    },
  });

  return {
    status: "success",
    products: products.map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      price: product.price.toString(),
      unit: product.productUnit,
      stock: product.productStocks[0]?.quantity.toString() ?? "0",
    })),
  };
}
