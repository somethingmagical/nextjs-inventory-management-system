"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWarehouseAccess } from "./authorization";
import { warehouseIdSchema } from "./warehouse-schema";
import { warehouseHasReferences } from "./references";
import type { WarehouseActionState } from "./create/action-state";

const deleteInputSchema = z.object({
  warehouseId: warehouseIdSchema,
});

export async function deleteWarehouse(
  warehouseId: string,
  _previousState: WarehouseActionState,
  _formData: FormData,
): Promise<WarehouseActionState> {
  const access = await getWarehouseAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a warehouse." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage warehouses." };
  }

  const parsedInput = deleteInputSchema.safeParse({ warehouseId });
  if (!parsedInput.success) {
    return { status: "error", message: "This warehouse could not be found." };
  }

  const result = await db.$transaction(
    async (transaction) => {
      const warehouse = await transaction.warehouse.findFirst({
        where: { id: parsedInput.data.warehouseId, deletedAt: null },
        select: { id: true, name: true },
      });

      if (!warehouse) {
        return {
          status: "error" as const,
          message: "This warehouse no longer exists or has already been deleted.",
        };
      }

      if (await warehouseHasReferences(transaction, warehouse.id)) {
        return {
          status: "error" as const,
          message: `“${warehouse.name}” is in use and cannot be deleted. Remove or reassign its related records first.`,
        };
      }

      const update = await transaction.warehouse.updateMany({
        where: { id: warehouse.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (update.count !== 1) {
        return {
          status: "error" as const,
          message: "This warehouse could not be deleted. Refresh and try again.",
        };
      }

      return { status: "success" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/warehouse");
  redirect("/warehouse?deleted=1");
}
