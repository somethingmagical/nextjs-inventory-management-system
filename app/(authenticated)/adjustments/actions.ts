"use server";

import { Prisma, type AdjustmentType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { applyStockAdjustment, InsufficientStockError } from "@/lib/product-stock";
import { getAdjustmentAccess } from "./authorization";
import {
  adjustmentIdSchema,
  adjustmentSchema,
  adjustmentSearchSchema,
} from "./adjustment-schema";
import type { AdjustmentActionState } from "./action-state";

export type AdjustmentSearchResult =
  | {
      status: "success";
      products: {
        id: string;
        name: string;
        code: string;
        productUnit: string;
        stock: string;
      }[];
    }
  | { status: "error"; message: string };

export async function searchAdjustmentProducts(
  warehouseId: string,
  query: string,
): Promise<AdjustmentSearchResult> {
  const access = await getAdjustmentAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before searching products." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage adjustments." };
  }

  const parsed = adjustmentSearchSchema.safeParse({ warehouseId, query });
  if (!parsed.success) {
    return { status: "error", message: "Choose a warehouse and enter a valid product search." };
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
      name: true,
      code: true,
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
      name: product.name,
      code: product.code,
      productUnit: product.productUnit,
      stock: product.productStocks[0]?.quantity.toString() ?? "0",
    })),
  };
}

export async function createAdjustment(
  _previousState: AdjustmentActionState,
  formData: FormData,
): Promise<AdjustmentActionState> {
  const access = await getAdjustmentAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating an adjustment." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage adjustments." };
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return { status: "error", message: "The adjustment items are invalid. Review the products and try again." };
  }

  const parsed = adjustmentSchema.safeParse({
    warehouseId: formData.get("warehouseId"),
    date: formData.get("date"),
    items,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter valid adjustment details." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const warehouse = await transaction.warehouse.findFirst({
        where: { id: parsed.data.warehouseId, deletedAt: null },
        select: { id: true },
      });
      if (!warehouse) {
        throw new Error("The selected warehouse is no longer available.");
      }

      const productIds = parsed.data.items.map((item) => item.productId);
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
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          items: {
            create: parsed.data.items.map((item) => ({
              productId: item.productId,
              quantity: new Prisma.Decimal(item.quantity),
              type: item.type,
            })),
          },
        },
        select: { id: true },
      });

      for (const item of parsed.data.items) {
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
        });
      }

      return adjustment.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && error.message === "The selected warehouse is no longer available.") {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && error.message === "One or more selected products are no longer available.") {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Stock changed while saving. Refresh the page and try again." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", message: "The adjustment reference conflicted. Please submit it again." };
    }
    throw error;
  }

  revalidatePath("/adjustments");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/adjustments?created=1");
}

export async function deleteAdjustment(
  adjustmentId: string,
): Promise<AdjustmentActionState> {
  const access = await getAdjustmentAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting an adjustment." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage adjustments." };
  }

  const parsedId = adjustmentIdSchema.safeParse(adjustmentId);
  if (!parsedId.success) {
    return { status: "error", message: "This adjustment could not be found." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const adjustment = await transaction.adjustment.findFirst({
        where: { id: parsedId.data, deletedAt: null },
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
        });
      }

      const updated = await transaction.adjustment.updateMany({
        where: { id: adjustment.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new Error("This adjustment could not be deleted. Refresh and try again.");
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { status: "error", message: error.message };
    }
    if (
      error instanceof Error &&
      (error.message === "This adjustment no longer exists or has already been deleted." ||
        error.message === "This adjustment could not be deleted. Refresh and try again.")
    ) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Stock changed while deleting. Refresh the page and try again." };
    }
    throw error;
  }

  revalidatePath("/adjustments");
  revalidatePath(`/adjustments/${encodeURIComponent(parsedId.data)}`);
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/adjustments?deleted=1");
}
