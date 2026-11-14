"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setWarehouseStockQuantity, WarehouseStockEditError } from "@/features/inventory/adjustments";
import {
  StockBalanceChangedError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import { getAdjustmentAccess } from "../adjustments/authorization";

const idSchema = z.string().trim().min(1).max(191);
const quantitySchema = z.string().trim().regex(/^\d{1,9}(?:\.\d{1,3})?$/);

export type ClearWarehouseStockResult =
  | { status: "success"; changed: boolean }
  | { status: "error"; message: string };

export async function clearWarehouseStock(
  productId: string,
  warehouseId: string,
  expectedQuantity: string,
): Promise<ClearWarehouseStockResult> {
  const access = await getAdjustmentAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before managing stock." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage adjustments." };
  }

  const parsedProductId = idSchema.safeParse(productId);
  const parsedWarehouseId = idSchema.safeParse(warehouseId);
  const parsedQuantity = quantitySchema.safeParse(expectedQuantity);
  if (!parsedProductId.success || !parsedWarehouseId.success) {
    return { status: "error", message: "This product or warehouse could not be found." };
  }
  if (!parsedQuantity.success) {
    return { status: "error", message: "The current stock quantity is invalid. Refresh and try again." };
  }

  try {
    const adjustmentId = await setWarehouseStockQuantity({
      productId: parsedProductId.data,
      warehouseId: parsedWarehouseId.data,
      expectedQuantity: new Prisma.Decimal(parsedQuantity.data),
      targetQuantity: new Prisma.Decimal(0),
      date: new Date().toISOString().slice(0, 10),
      actorId: access.userId,
    });

    if (adjustmentId) {
      revalidatePath("/stock");
      revalidatePath("/adjustments");
      revalidatePath("/products");
      revalidatePath(`/products/${encodeURIComponent(parsedProductId.data)}`);
      revalidatePath("/dashboard");
      revalidatePath("/warehouse");
    }

    return { status: "success", changed: adjustmentId !== null };
  } catch (error) {
    if (error instanceof StockBalanceChangedError) {
      return { status: "error", message: "Stock changed while saving. Refresh the page and try again." };
    }
    if (error instanceof StockQuantityLimitError || error instanceof WarehouseStockEditError) {
      return { status: "error", message: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2002" || error.code === "P2034")
    ) {
      return { status: "error", message: "Stock changed while saving. Refresh the page and try again." };
    }
    throw error;
  }
}
