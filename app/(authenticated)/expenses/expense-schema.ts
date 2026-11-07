import { Prisma } from "@prisma/client";
import { z } from "zod";

export const expenseIdSchema = z.string().trim().min(1).max(191);

const expenseAmountSchema = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimal places.")
  .refine((value) => new Prisma.Decimal(value).greaterThan(0), "Amount must be greater than zero.");

export const expenseInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid expense date."),
  title: z.string().trim().min(1, "Enter an expense title.").max(191, "Title must be 191 characters or fewer."),
  warehouseId: z.string().trim().min(1).max(191),
  expenseCategoryId: z.string().trim().min(1).max(191),
  amount: expenseAmountSchema,
  details: z.string().trim().max(5000, "Details must be 5,000 characters or fewer.")
    .transform((value) => value || null),
});
