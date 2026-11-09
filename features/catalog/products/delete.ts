import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function softDeleteProduct(id: string) {
  return db.$transaction(
    async (transaction) => {
      const product = await transaction.product.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
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
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
