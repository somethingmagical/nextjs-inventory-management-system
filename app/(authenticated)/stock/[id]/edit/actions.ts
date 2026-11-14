"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  setWarehouseStockQuantity,
  WarehouseStockEditError,
} from "@/features/inventory/adjustments";
import {
  StockBalanceChangedError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import { getAdjustmentAccess } from "../../../adjustments/authorization";
import type { StockQuantityEditActionState } from "./action-state";

const idSchema = z.string().trim().min(1).max(191);
const quantitySchema = z.string().trim().regex(
  /^\d{1,9}(?:\.\d{1,3})?$/,
  "Enter a non-negative quantity with up to 3 decimal places.",
);

export async function updateWarehouseStockQuantity(
  productId: string,
  warehouseId: string,
  _previousState: StockQuantityEditActionState,
  formData: FormData,
): Promise<StockQuantityEditActionState> {
  const access = await getAdjustmentAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before editing stock." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage adjustments." };
  }

  const parsedProductId = idSchema.safeParse(productId);
  const parsedWarehouseId = idSchema.safeParse(warehouseId);
  const parsedQuantities = z.object({
    expectedQuantity: quantitySchema,
    targetQuantity: quantitySchema,
  }).safeParse({
    expectedQuantity: formData.get("expectedQuantity"),
    targetQuantity: formData.get("targetQuantity"),
  });
  if (!parsedProductId.success || !parsedWarehouseId.success) {
    return { status: "error", message: "This product or warehouse could not be found." };
  }
  if (!parsedQuantities.success) {
    return {
      status: "error",
      message: parsedQuantities.error.issues[0]?.message ?? "Enter a valid stock quantity.",
    };
  }

  try {
    const adjustmentId = await setWarehouseStockQuantity({
      productId: parsedProductId.data,
      warehouseId: parsedWarehouseId.data,
      expectedQuantity: new Prisma.Decimal(parsedQuantities.data.expectedQuantity),
      targetQuantity: new Prisma.Decimal(parsedQuantities.data.targetQuantity),
      date: new Date().toISOString().slice(0, 10),
      actorId: access.userId,
    });
    if (!adjustmentId) {
      return { status: "success", message: "The stock quantity is already up to date." };
    }
  } catch (error) {
    if (error instanceof StockBalanceChangedError) {
      return { status: "error", message: "Stock changed while saving. Refresh the page and try again." };
    }
    if (error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof WarehouseStockEditError) {
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

  revalidatePath("/stock");
  revalidatePath("/adjustments");
  revalidatePath("/products");
  revalidatePath(`/products/${encodeURIComponent(parsedProductId.data)}`);
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect(`/stock?warehouseId=${encodeURIComponent(parsedWarehouseId.data)}&updated=1`);
}
