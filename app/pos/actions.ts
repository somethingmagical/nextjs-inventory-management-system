"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/authorization";
import { db } from "@/lib/db";
import { PERMISSION } from "@/lib/permissions";
import { getPosProducts } from "./data";

const warehouseIdSchema = z.string().trim().min(1).max(191);

export type PosProductsResult =
  | { status: "success"; products: Awaited<ReturnType<typeof getPosProducts>> }
  | { status: "error"; message: string };

export async function loadPosProducts(warehouseId: string): Promise<PosProductsResult> {
  const access = await requirePermission(PERMISSION.managePosScreen);
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in to use the POS screen." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to use the POS screen." };
  }

  const parsedWarehouseId = warehouseIdSchema.safeParse(warehouseId);
  if (!parsedWarehouseId.success) {
    return { status: "error", message: "Select a valid warehouse to load products." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsedWarehouseId.data, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }

  return {
    status: "success",
    products: await getPosProducts(warehouse.id),
  };
}
