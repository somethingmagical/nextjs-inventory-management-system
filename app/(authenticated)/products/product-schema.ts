import { Prisma } from "@prisma/client";
import { z } from "zod";
import { MAX_PRODUCT_PRICE } from "@/lib/product-price";

export const productIdSchema = z.string().trim().min(1).max(191);

const requiredText = (label: string, max = 191) =>
  z.string().trim().min(1, `Choose a ${label.toLowerCase()}.`).max(max);

const optionalDecimal = (
  integerDigits: number,
  decimalPlaces: number,
  label: string,
) =>
  z.string()
    .trim()
    .transform((value) => value || null)
    .pipe(
      z
        .string()
        .nullable()
        .refine(
          (value) =>
            value === null ||
            new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${decimalPlaces}})?$`).test(value),
          `${label} must be a non-negative number with up to ${decimalPlaces} decimal places.`,
        ),
    );

const warehouseDiscountsSchema = z.string()
  .max(50_000, "Warehouse discount settings are too large.")
  .transform((serialized, context) => {
    try {
      const parsed: unknown = JSON.parse(serialized);
      return parsed;
    } catch {
      context.addIssue({ code: "custom", message: "Warehouse discount settings are invalid." });
      return z.NEVER;
    }
  })
  .pipe(z.array(z.object({
    warehouseId: z.string().trim().min(1).max(191),
    discountType: z.enum(["Fixed", "Percentage"]),
    discount: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Discount must be a non-negative amount with up to 2 decimal places."),
  })))
  .superRefine((overrides, context) => {
    const warehouseIds = new Set<string>();
    overrides.forEach((override, index) => {
      if (warehouseIds.has(override.warehouseId)) {
        context.addIssue({
          code: "custom",
          message: "A warehouse can only have one discount override.",
          path: [index, "warehouseId"],
        });
      }
      warehouseIds.add(override.warehouseId);
    });
  });

const productDetailsSchemaBase = z.object({
  code: z.string().trim().min(1, "Enter a product code.").max(191, "Product code must be 191 characters or fewer."),
  name: z.string().trim().min(1, "Enter a product name.").max(191, "Name must be 191 characters or fewer."),
  categoryId: requiredText("Product category"),
  brandId: requiredText("brand"),
  price: z.string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,${MAX_PRODUCT_PRICE.split(".")[0].length}}(?:\\.\\d{1,2})?$`),
      `Price must be a non-negative amount up to $${MAX_PRODUCT_PRICE} with up to 2 decimal places.`,
    ),
  productUnit: requiredText("product unit"),
  stockAlert: optionalDecimal(9, 3, "Stock alert"),
  orderTax: optionalDecimal(3, 2, "Order tax"),
  taxType: z.enum(["Exclusive", "Inclusive"]),
  defaultDiscountType: z.enum(["Fixed", "Percentage"]),
  defaultDiscount: z.string()
    .trim()
    .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Default discount must be a non-negative amount with up to 2 decimal places."),
  warehouseDiscounts: warehouseDiscountsSchema,
  quantityLimitation: optionalDecimal(9, 3, "Quantity limitation"),
  notes: z.string().trim().max(5000, "Notes must be 5,000 characters or fewer.")
    .transform((value) => value || null),
});

function validateDiscounts(
  product: z.output<typeof productDetailsSchemaBase>,
  context: z.RefinementCtx,
) {
  const price = new Prisma.Decimal(product.price);
  if (product.defaultDiscountType === "Percentage") {
    if (new Prisma.Decimal(product.defaultDiscount).greaterThan(100)) {
      context.addIssue({
        code: "custom",
        message: "Percentage discount cannot exceed 100%.",
        path: ["defaultDiscount"],
      });
    }
  } else if (new Prisma.Decimal(product.defaultDiscount).greaterThan(price)) {
    context.addIssue({
      code: "custom",
      message: "Fixed discount cannot exceed the product price.",
      path: ["defaultDiscount"],
    });
  }

  product.warehouseDiscounts.forEach((override, index) => {
    const discount = new Prisma.Decimal(override.discount);
    if (override.discountType === "Percentage" && discount.greaterThan(100)) {
      context.addIssue({
        code: "custom",
        message: "Percentage discount cannot exceed 100%.",
        path: ["warehouseDiscounts", index, "discount"],
      });
    } else if (override.discountType === "Fixed" && discount.greaterThan(price)) {
      context.addIssue({
        code: "custom",
        message: "Fixed discount cannot exceed the product price.",
        path: ["warehouseDiscounts", index, "discount"],
      });
    }
  });
}

export const productDetailsSchema = productDetailsSchemaBase.superRefine(validateDiscounts);

export const productSchema = productDetailsSchemaBase.extend({
  warehouseId: requiredText("warehouse"),
  supplierId: requiredText("supplier"),
  quantity: z.string()
    .trim()
    .regex(/^\d{1,9}(?:\.\d{1,3})?$/, "Quantity must be a non-negative number with up to 3 decimal places."),
  status: z.enum(["Received", "Pending", "Ordered"]),
}).superRefine(validateDiscounts);

export const productImageRemovalsSchema = z.array(z.string().trim().min(1).max(512)).max(10);

export type ProductValues = z.infer<typeof productSchema>;
export type ProductDetailsValues = z.infer<typeof productDetailsSchema>;
export type ProductFormValues = {
  code: string;
  name: string;
  categoryId: string;
  brandId: string;
  price: string;
  productUnit: string;
  stockAlert: string;
  orderTax: string;
  taxType: "Exclusive" | "Inclusive";
  defaultDiscountType: "Fixed" | "Percentage";
  defaultDiscount: string;
  quantityLimitation: string;
  notes: string;
  warehouseId: string;
  supplierId: string;
  quantity: string;
  status: "Received" | "Pending" | "Ordered";
};
