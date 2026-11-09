"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { InsufficientStockError } from "@/lib/product-stock";
import {
  createAdjustment as createAdjustmentRecord,
  deleteAdjustment as deleteAdjustmentRecord,
} from "@/features/inventory/adjustments";
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
    await createAdjustmentRecord({ ...parsed.data, actorId: access.userId });
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
    await deleteAdjustmentRecord(parsedId.data, access.userId);
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
