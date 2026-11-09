"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCustomerAccess } from "./authorization";
import { customerHasSalesOrQuotationReferences } from "./references";
import { customerIdSchema } from "./customer-schema";
import type { CustomerActionState } from "./create/action-state";

const deleteInputSchema = z.object({
  customerId: customerIdSchema,
});

export async function deleteCustomer(
  customerId: string,
  _previousState: CustomerActionState,
  _formData: FormData,
): Promise<CustomerActionState> {
  const access = await getCustomerAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a customer." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage customers." };
  }

  const parsedInput = deleteInputSchema.safeParse({ customerId });
  if (!parsedInput.success) {
    return { status: "error", message: "This customer could not be found." };
  }

  const result = await db.$transaction(
    async (transaction) => {
      const customer = await transaction.customer.findFirst({
        where: { id: parsedInput.data.customerId, deletedAt: null },
        select: { id: true, name: true },
      });

      if (!customer) {
        return {
          status: "error" as const,
          message: "This customer no longer exists or has already been deleted.",
        };
      }

      // POS uses this walk-in record as its fallback customer, so it must never be soft-deleted.
      if (customer.id === "direct-customer") {
        return {
          status: "error" as const,
          message: "The default POS customer cannot be deleted.",
        };
      }

      if (await customerHasSalesOrQuotationReferences(transaction, customer.id)) {
        return {
          status: "error" as const,
          message: `“${customer.name}” is linked to sales or quotations and cannot be deleted. Reassign or remove those records first.`,
        };
      }

      const update = await transaction.customer.updateMany({
        where: { id: customer.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (update.count !== 1) {
        return {
          status: "error" as const,
          message: "This customer could not be deleted. Refresh and try again.",
        };
      }

      return { status: "success" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/customers");
  redirect("/customers?deleted=1");
}
