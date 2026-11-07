"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MasterDataActionState } from "@/app/master-data/action-state";
import { db } from "@/lib/db";
import { getExpenseCategoryAccess } from "./authorization";

const nameSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Enter an expense category name.")
    .max(191, "Expense category name must be 191 characters or fewer."),
});
const updateSchema = nameSchema.extend({
  id: z.string().trim().min(1).max(191),
});
const deleteSchema = z.object({
  id: z.string().trim().min(1).max(191),
});

function denied(status: "unauthenticated" | "forbidden"): MasterDataActionState {
  return status === "unauthenticated"
    ? { status: "error", message: "Please sign in before managing expense categories." }
    : { status: "error", message: "You do not have permission to manage expense categories." };
}

function revalidateExpenseCategoryPages() {
  revalidatePath("/expense-categories");
}

export async function createExpenseCategory(formData: FormData): Promise<MasterDataActionState> {
  const access = await getExpenseCategoryAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the expense category name.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.expenseCategory.create({
    data: { name: parsed.data.name },
    select: { id: true },
  });

  revalidateExpenseCategoryPages();
  return { status: "success", message: "Expense category created successfully." };
}

export async function updateExpenseCategory(formData: FormData): Promise<MasterDataActionState> {
  const access = await getExpenseCategoryAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the expense category details.",
      fieldErrors: { name: parsed.error.flatten().fieldErrors.name },
    };
  }

  const updated = await db.$transaction(async (transaction) => {
    const category = await transaction.expenseCategory.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
      select: { id: true },
    });
    if (!category) return false;

    const result = await transaction.expenseCategory.updateMany({
      where: { id: category.id, deletedAt: null },
      data: { name: parsed.data.name },
    });
    return result.count === 1;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!updated) {
    return { status: "error", message: "This expense category no longer exists or could not be updated." };
  }

  revalidateExpenseCategoryPages();
  return { status: "success", message: "Expense category updated successfully." };
}

export async function deleteExpenseCategory(formData: FormData): Promise<MasterDataActionState> {
  const access = await getExpenseCategoryAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { status: "error", message: "This expense category could not be found." };
  }

  const result = await db.$transaction(async (transaction) => {
    const category = await transaction.expenseCategory.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
      select: { id: true },
    });
    if (!category) {
      return { status: "error" as const, message: "This expense category no longer exists." };
    }

    const expenseCount = await transaction.expense.count({
      where: { expenseCategoryId: category.id },
    });
    if (expenseCount > 0) {
      return {
        status: "error" as const,
        message: "This category is used by expense records and cannot be deleted. Reassign those expenses to another category first.",
      };
    }

    const deleted = await transaction.expenseCategory.updateMany({
      where: { id: category.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return deleted.count === 1
      ? { status: "success" as const }
      : { status: "error" as const, message: "This expense category could not be deleted." };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.status === "error") return result;

  revalidateExpenseCategoryPages();
  return { status: "success", message: "Expense category deleted successfully." };
}
