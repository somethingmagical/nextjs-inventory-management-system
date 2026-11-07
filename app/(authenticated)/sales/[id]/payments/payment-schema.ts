import { Prisma } from "@prisma/client";
import { z } from "zod";

export const saleIdSchema = z.string().trim().min(1).max(191);

const paymentAmountSchema = z.string()
  .trim()
  .regex(
    /^\d{1,10}(?:\.\d{1,2})?$/,
    "Payment amount must be a non-negative amount with at most 2 decimal places.",
  )
  .refine(
    (value) => new Prisma.Decimal(value).greaterThan(0),
    "Payment amount must be greater than zero.",
  );

export const salePaymentSchema = z.object({
  amount: paymentAmountSchema,
  paymentType: z.string().trim().min(1).max(191),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid payment date."),
  notes: z.string().trim().max(2000).nullable(),
});
