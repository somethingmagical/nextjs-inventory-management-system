import { z } from "zod";

export const adjustmentIdSchema = z.string().trim().min(1).max(191);

const quantitySchema = z.string()
  .trim()
  .regex(/^\d{1,9}(?:\.\d{1,3})?$/, "Quantity must be at least 1, with up to 3 decimal places.")
  .refine((quantity) => Number(quantity) >= 1, "Quantity must be at least 1.");

export const adjustmentItemSchema = z.object({
  productId: z.string().trim().min(1).max(191),
  quantity: quantitySchema,
  type: z.enum(["Addition", "Subtraction"]),
});

export const adjustmentSchema = z.object({
  warehouseId: z.string().trim().min(1).max(191),
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
    .refine((date) => {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    }, "Choose a valid date."),
  items: z.array(adjustmentItemSchema)
    .min(1, "Add at least one product.")
    .max(100, "An adjustment can contain at most 100 products.")
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      "A product can only be added once.",
    ),
});

export const adjustmentSearchSchema = z.object({
  warehouseId: z.string().trim().min(1).max(191),
  query: z.string().trim().min(1).max(120),
});

export type AdjustmentValues = z.infer<typeof adjustmentSchema>;
