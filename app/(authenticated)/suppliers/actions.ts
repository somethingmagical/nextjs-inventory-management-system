"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSupplierAccess } from "./authorization";
import { supplierIdSchema } from "./supplier-schema";
import { supplierHasReferences } from "./references";
import type { SupplierActionState } from "./create/action-state";

const deleteInputSchema = z.object({
  supplierId: supplierIdSchema,
});

export async function deleteSupplier(
  supplierId: string,
): Promise<SupplierActionState> {
  const access = await getSupplierAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a supplier." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage suppliers." };
  }

  const parsedInput = deleteInputSchema.safeParse({ supplierId });
  if (!parsedInput.success) {
    return { status: "error", message: "This supplier could not be found." };
  }

  const result = await db.$transaction(
    async (transaction) => {
      const supplier = await transaction.supplier.findFirst({
        where: { id: parsedInput.data.supplierId, deletedAt: null },
        select: { id: true, name: true },
      });

      if (!supplier) {
        return {
          status: "error" as const,
          message: "This supplier no longer exists or has already been deleted.",
        };
      }

      if (await supplierHasReferences(transaction, supplier.id)) {
        return {
          status: "error" as const,
          message: `“${supplier.name}” is linked to purchases or other records and cannot be deleted. Reassign or remove those records first.`,
        };
      }

      const update = await transaction.supplier.updateMany({
        where: { id: supplier.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (update.count !== 1) {
        return {
          status: "error" as const,
          message: "This supplier could not be deleted. Refresh and try again.",
        };
      }

      return { status: "success" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/suppliers");
  return { status: "success", message: "Supplier deleted successfully." };
}
