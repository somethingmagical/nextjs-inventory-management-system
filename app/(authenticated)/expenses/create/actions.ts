"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ExpenseActionState } from "./action-state";
import { getExpenseAccess } from "../authorization";
import { expenseIdSchema, expenseInputSchema } from "../expense-schema";
import { db } from "@/lib/db";

type ExpenseFormAction = (
  state: ExpenseActionState,
  formData: FormData,
) => Promise<ExpenseActionState>;

function denied(status: "unauthenticated" | "forbidden") {
  return {
    status: "error" as const,
    message: status === "unauthenticated"
      ? "Please sign in before managing expenses."
      : "You do not have permission to manage expenses.",
  };
}

function parseExpenseForm(formData: FormData) {
  return expenseInputSchema.safeParse({
    date: formData.get("date"),
    title: formData.get("title"),
    warehouseId: formData.get("warehouseId"),
    expenseCategoryId: formData.get("expenseCategoryId"),
    amount: formData.get("amount"),
    details: formData.get("details") ?? "",
  });
}

function firstIssueMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Enter valid expense details.";
}

export const createExpense: ExpenseFormAction = async (_previousState, formData) => {
  const access = await getExpenseAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = parseExpenseForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: firstIssueMessage(parsed.error),
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const [warehouse, category] = await Promise.all([
    db.warehouse.findFirst({
      where: { id: parsed.data.warehouseId, deletedAt: null },
      select: { id: true },
    }),
    db.expenseCategory.findFirst({
      where: { id: parsed.data.expenseCategoryId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }
  if (!category) {
    return { status: "error", message: "The selected expense category is no longer available." };
  }

  let created = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = `EX_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    try {
      await db.expense.create({
        data: {
          reference,
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          title: parsed.data.title,
          warehouseId: warehouse.id,
          expenseCategoryId: category.id,
          amount: new Prisma.Decimal(parsed.data.amount),
          details: parsed.data.details,
        },
        select: { id: true },
      });
      created = true;
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return { status: "error", message: "The warehouse or category changed while saving. Refresh and try again." };
      }
      throw error;
    }
  }
  if (!created) {
    return { status: "error", message: "Could not generate an expense reference. Please try again." };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses?created=1");
};

export async function updateExpense(
  expenseId: string,
  _previousState: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const access = await getExpenseAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsedId = expenseIdSchema.safeParse(expenseId);
  if (!parsedId.success) {
    return { status: "error", message: "This expense could not be found." };
  }
  const parsed = parseExpenseForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: firstIssueMessage(parsed.error),
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const [expense, warehouse, category] = await Promise.all([
    db.expense.findFirst({
      where: { id: parsedId.data, deletedAt: null },
      select: { id: true },
    }),
    db.warehouse.findFirst({
      where: { id: parsed.data.warehouseId, deletedAt: null },
      select: { id: true },
    }),
    db.expenseCategory.findFirst({
      where: { id: parsed.data.expenseCategoryId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!expense) {
    return { status: "error", message: "This expense no longer exists or has been deleted." };
  }
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }
  if (!category) {
    return { status: "error", message: "The selected expense category is no longer available." };
  }

  let updated;
  try {
    updated = await db.expense.updateMany({
      where: { id: expense.id, deletedAt: null },
      data: {
        date: new Date(`${parsed.data.date}T00:00:00.000Z`),
        title: parsed.data.title,
        warehouseId: warehouse.id,
        expenseCategoryId: category.id,
        amount: new Prisma.Decimal(parsed.data.amount),
        details: parsed.data.details,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { status: "error", message: "The warehouse or category changed while saving. Refresh and try again." };
    }
    throw error;
  }
  if (updated.count !== 1) {
    return { status: "error", message: "This expense no longer exists or could not be updated." };
  }

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${encodeURIComponent(expense.id)}/edit`);
  revalidatePath("/dashboard");
  redirect("/expenses?updated=1");
}
