"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { ExpenseActionState } from "./create/action-state";
import { getExpenseAccess } from "./authorization";
import { expenseIdSchema } from "./expense-schema";

export async function deleteExpense(expenseId: string): Promise<ExpenseActionState> {
  const access = await getExpenseAccess();
  if (access.status !== "allowed") {
    return {
      status: "error",
      message: access.status === "unauthenticated"
        ? "Please sign in before managing expenses."
        : "You do not have permission to manage expenses.",
    };
  }

  const parsedId = expenseIdSchema.safeParse(expenseId);
  if (!parsedId.success) {
    return { status: "error", message: "This expense could not be found." };
  }

  const result = await db.$transaction(async (transaction) => {
    const expense = await transaction.expense.findFirst({
      where: { id: parsedId.data, deletedAt: null },
      select: { id: true },
    });
    if (!expense) {
      return { status: "error" as const, message: "This expense no longer exists or has already been deleted." };
    }

    const deleted = await transaction.expense.updateMany({
      where: { id: expense.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return deleted.count === 1
      ? { status: "success" as const }
      : { status: "error" as const, message: "This expense could not be deleted. Refresh and try again." };
  });

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses?deleted=1");
}
