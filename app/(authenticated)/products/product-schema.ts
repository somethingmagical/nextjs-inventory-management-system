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

export const productDetailsSchema = z.object({
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
  quantityLimitation: optionalDecimal(9, 3, "Quantity limitation"),
  notes: z.string().trim().max(5000, "Notes must be 5,000 characters or fewer.")
    .transform((value) => value || null),
});

export const productSchema = productDetailsSchema.extend({
  warehouseId: requiredText("warehouse"),
  supplierId: requiredText("supplier"),
  quantity: z.string()
    .trim()
    .regex(/^\d{1,9}(?:\.\d{1,3})?$/, "Quantity must be a non-negative number with up to 3 decimal places."),
  status: z.enum(["Received", "Pending", "Ordered"]),
});

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
  quantityLimitation: string;
  notes: string;
  warehouseId: string;
  supplierId: string;
  quantity: string;
  status: "Received" | "Pending" | "Ordered";
};
