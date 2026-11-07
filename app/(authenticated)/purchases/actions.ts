"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { receivePurchaseStock, StockQuantityLimitError } from "@/lib/product-stock";
import { getPurchaseAccess } from "./authorization";
import { purchaseCreateSchema } from "./purchase-create-schema";
import { purchaseProductSearchSchema } from "./purchase-schema";
import type { PurchaseCreateActionState } from "./create/action-state";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";

export type PurchaseProductSearchResult =
  | {
      status: "success";
      products: {
        id: string;
        code: string;
        name: string;
        netUnitCost: string;
        unit: string;
        stock: string;
      }[];
    }
  | { status: "error"; message: string };

export async function createPurchase(
  _previousState: PurchaseCreateActionState,
  formData: FormData,
): Promise<PurchaseCreateActionState> {
  const access = await getPurchaseAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a purchase." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchases." };
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return { status: "error", message: "Purchase items are invalid. Review the products and try again." };
  }

  const parsed = purchaseCreateSchema.safeParse({
    warehouseId: formData.get("warehouseId"),
    supplierId: formData.get("supplierId"),
    date: formData.get("date"),
    status: formData.get("status"),
    orderTax: formData.get("orderTax"),
    discount: formData.get("discount"),
    shipping: formData.get("shipping"),
    notes: formData.get("notes") || null,
    items,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter valid purchase details.",
    };
  }

  const lineTotals: ReturnType<typeof calculatePurchaseLineTotals>[] = [];
  try {
    for (const item of parsed.data.items) {
      lineTotals.push(calculatePurchaseLineTotals({
        unitCost: item.netUnitCost,
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
      message: error instanceof Error ? error.message : "Enter valid purchase line details.",
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
      message: error instanceof Error ? error.message : "Enter valid purchase totals.",
    };
  }
  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Purchase totals exceed the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const [warehouse, supplier, products] = await Promise.all([
        transaction.warehouse.findFirst({
          where: { id: parsed.data.warehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.supplier.findFirst({
          where: { id: parsed.data.supplierId, deletedAt: null },
          select: { id: true },
        }),
        transaction.product.findMany({
          where: {
            id: { in: parsed.data.items.map((item) => item.productId) },
            deletedAt: null,
          },
          select: { id: true, productUnit: true },
        }),
      ]);

      if (!warehouse) throw new Error("The selected warehouse is no longer available.");
      if (!supplier) throw new Error("The selected supplier is no longer available.");
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
          throw new Error("One or more selected purchase units are no longer available.");
        }
      }

      const reference = `PU_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      await transaction.purchase.create({
        data: {
          reference,
          warehouseId: warehouse.id,
          supplierId: supplier.id,
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          status: parsed.data.status,
          orderTax: new Prisma.Decimal(parsed.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          notes: parsed.data.notes,
          items: {
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId,
              netUnitCost: new Prisma.Decimal(item.netUnitCost),
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
        select: { id: true },
      });

      if (parsed.data.status === "Received") {
        for (const item of parsed.data.items) {
          await receivePurchaseStock(transaction, {
            productId: item.productId,
            warehouseId: warehouse.id,
            supplierId: supplier.id,
            quantity: item.quantity,
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && [
      "The selected warehouse is no longer available.",
      "The selected supplier is no longer available.",
      "One or more selected products are no longer available.",
      "One or more selected purchase units are no longer available.",
    ].includes(error.message)) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Inventory changed while saving. Refresh the page and try again." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", message: "The purchase reference conflicted. Please submit it again." };
    }
    throw error;
  }

  revalidatePath("/purchases");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/purchases?created=1");
}

export async function searchPurchaseProducts(
  warehouseId: string,
  query: string,
): Promise<PurchaseProductSearchResult> {
  const access = await getPurchaseAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before searching products." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchases." };
  }

  const parsed = purchaseProductSearchSchema.safeParse({ warehouseId, query });
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
      purchasePrice: true,
      productUnit: true,
      productStocks: {
        where: { warehouseId: warehouse.id },
        select: { quantity: true },
      },
    },
  });

  return {
    status: "success",
    products: products.map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      netUnitCost: product.purchasePrice.toString(),
      unit: product.productUnit,
      stock: product.productStocks[0]?.quantity.toString() ?? "0",
    })),
  };
}
