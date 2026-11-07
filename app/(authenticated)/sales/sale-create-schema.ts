import { Prisma } from "@prisma/client";
import { z } from "zod";

const decimalString = (scale: number, maxIntegerDigits: number, label: string) =>
  z.string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,${maxIntegerDigits}}(?:\\.\\d{1,${scale}})?$`),
      `${label} must be a non-negative decimal with at most ${scale} decimal places.`,
    );

const percentageString = (label: string) =>
  decimalString(2, 3, label).refine(
    (value) => new Prisma.Decimal(value).lessThanOrEqualTo(100),
    `${label} cannot exceed 100%.`,
  );

const saleItemSchema = z.object({
  productId: z.string().trim().min(1).max(191),
  price: decimalString(2, 10, "Unit price"),
  quantity: decimalString(3, 9, "Quantity").refine(
    (value) => new Prisma.Decimal(value).greaterThan(0),
    "Quantity must be greater than zero.",
  ),
  unit: z.string().trim().min(1).max(191),
  discountType: z.enum(["Fixed", "Percentage"]),
  discount: decimalString(2, 10, "Line discount"),
  taxType: z.enum(["Inclusive", "Exclusive"]),
  orderTax: percentageString("Line tax rate"),
});

export const saleCreateSchema = z.object({
  warehouseId: z.string().trim().min(1).max(191),
  customerId: z.string().trim().min(1).max(191),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid sale date."),
  status: z.enum(["Pending", "Ordered", "Received"]),
  orderTax: percentageString("Order tax rate"),
  discount: decimalString(2, 10, "Order discount"),
  shipping: decimalString(2, 10, "Shipping"),
  paid: decimalString(2, 10, "Initial payment"),
  paymentType: z.string().trim().min(1).max(191),
  notes: z.string().trim().max(5000).nullable(),
  items: z.array(saleItemSchema).min(1, "Add at least one product to the sale.").max(100),
}).superRefine((sale, context) => {
  const productIds = new Set<string>();
  for (const [index, item] of sale.items.entries()) {
    if (productIds.has(item.productId)) {
      context.addIssue({
        code: "custom",
        message: "A product can only be added once to a sale.",
        path: ["items", index, "productId"],
      });
    }
    productIds.add(item.productId);
  }
});
