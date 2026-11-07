"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getProductAccess } from "./authorization";
import { productIdSchema } from "./product-schema";
import type { ProductActionState } from "./create/action-state";

export async function deleteProduct(productId: string): Promise<ProductActionState> {
  const access = await getProductAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a product." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage products." };
  }

  const parsedId = productIdSchema.safeParse(productId);
  if (!parsedId.success) {
    return { status: "error", message: "This product could not be found." };
  }

  const result = await db.$transaction(
    async (transaction) => {
      const product = await transaction.product.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: { id: true, name: true },
      });

      if (!product) {
        return {
          status: "error" as const,
          message: "This product no longer exists or has already been deleted.",
        };
      }

      const update = await transaction.product.updateMany({
        where: { id: product.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (update.count !== 1) {
        return {
          status: "error" as const,
          message: "This product could not be deleted. Refresh and try again.",
        };
      }

      return { status: "success" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${encodeURIComponent(parsedId.data)}`);
  revalidatePath(`/products/${encodeURIComponent(parsedId.data)}/edit`);
  return { status: "success", message: "Product deleted successfully." };
}
