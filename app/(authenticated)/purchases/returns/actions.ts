"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  InsufficientStockError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import {
  deletePurchaseReturn as deletePurchaseReturnTransaction,
  savePurchaseReturn as savePurchaseReturnTransaction,
} from "@/features/procurement/purchase-returns";
import { getPurchaseReturnAccess } from "./authorization";
import {
  purchaseReturnCreateSchema,
  purchaseReturnIdSchema,
} from "./purchase-return-create-schema";
import type { PurchaseReturnCreateActionState } from "./create/action-state";

const purchaseReturnProductSearchSchema = z.object({
  warehouseId: z.string().trim().min(1, "Select a warehouse to search products."),
  query: z.string().trim().min(2).max(120),
});

export type PurchaseReturnProductSearchResult =
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

export async function savePurchaseReturn(
  _previousState: PurchaseReturnCreateActionState,
  formData: FormData,
): Promise<PurchaseReturnCreateActionState> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before saving a purchase return." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const rawReturnId = formData.get("returnId");
  let returnId: string | undefined;
  if (rawReturnId !== null) {
    const parsedId = purchaseReturnIdSchema.safeParse(rawReturnId);
    if (!parsedId.success) {
      return { status: "error", message: "This purchase return could not be found." };
    }
    returnId = parsedId.data;
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return {
      status: "error",
      message: "Purchase return items are invalid. Review the products and try again.",
    };
  }

  const parsed = purchaseReturnCreateSchema.safeParse({
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
      message: parsed.error.issues[0]?.message ?? "Enter valid purchase return details.",
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
      message: error instanceof Error ? error.message : "Enter valid purchase return line details.",
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
      message: error instanceof Error ? error.message : "Enter valid purchase return totals.",
    };
  }

  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Purchase return totals exceed the supported amount." };
  }

  try {
    await savePurchaseReturnTransaction({
      ...parsed.data,
      returnId,
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      totals,
      actorId: access.userId,
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && [
      "The selected warehouse is no longer available.",
      "The selected supplier is no longer available.",
      "One or more selected products are no longer available.",
      "One or more selected purchase return units are no longer available.",
      "This purchase return no longer exists or has already been deleted.",
      "The new grand total cannot be less than the amount already paid.",
    ].includes(error.message)) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        status: "error",
        message: "Inventory changed while saving. Refresh the page and try again.",
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "The purchase return reference conflicted. Please submit it again.",
      };
    }
    throw error;
  }

  revalidatePath("/purchases/returns");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  revalidatePath("/purchases/returns/[id]", "page");
  if (returnId) redirect("/purchases/returns?updated=1");
  redirect("/purchases/returns?created=1");
}

export async function fetchPurchaseReturnProductStocks(
  warehouseId: string,
  productIds: string[],
): Promise<
  | { status: "success"; stocks: { productId: string; stock: string }[] }
  | { status: "error"; message: string }
> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before loading warehouse stock." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const parsed = z.object({
    warehouseId: z.string().trim().min(1).max(191),
    productIds: z.array(z.string().trim().min(1).max(191)).max(100),
  }).safeParse({ warehouseId, productIds });
  if (!parsed.success) {
    return { status: "error", message: "The warehouse stock request is invalid." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsed.data.warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }

  const stocks = await db.productStock.findMany({
    where: {
      warehouseId: warehouse.id,
      productId: { in: parsed.data.productIds },
    },
    select: { productId: true, quantity: true },
  });
  const stockByProductId = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));

  return {
    status: "success",
    stocks: parsed.data.productIds.map((productId) => ({
      productId,
      stock: stockByProductId.get(productId)?.toString() ?? "0",
    })),
  };
}

export async function deletePurchaseReturn(
  _previousState: PurchaseReturnCreateActionState,
  formData: FormData,
): Promise<PurchaseReturnCreateActionState> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a purchase return." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const parsedId = purchaseReturnIdSchema.safeParse(formData.get("returnId"));
  if (!parsedId.success) {
    return { status: "error", message: "This purchase return could not be found." };
  }

  try {
    await deletePurchaseReturnTransaction(parsedId.data, access.userId);
  } catch (error) {
    if (error instanceof StockQuantityLimitError) {
      return {
        status: "error",
        message: "Restoring this return would exceed the supported stock quantity. No changes were made.",
      };
    }
    if (error instanceof Error && error.message === "This purchase return no longer exists or has already been deleted.") {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        status: "error",
        message: "Inventory changed while deleting. Refresh the page and try again.",
      };
    }
    throw error;
  }

  revalidatePath("/purchases/returns");
  revalidatePath("/purchases/returns/[id]", "page");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/purchases/returns?deleted=1");
}

export async function searchPurchaseReturnProducts(
  warehouseId: string,
  query: string,
): Promise<PurchaseReturnProductSearchResult> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before searching products." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const parsed = purchaseReturnProductSearchSchema.safeParse({ warehouseId, query });
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
      productStocks: {
        some: {
          warehouseId: warehouse.id,
          quantity: { gt: 0 },
        },
      },
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
        where: {
          warehouseId: warehouse.id,
          quantity: { gt: 0 },
        },
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
