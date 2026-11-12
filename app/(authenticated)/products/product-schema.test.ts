import assert from "node:assert/strict";
import test from "node:test";
import { productDetailsSchema } from "./product-schema";

const validProductDetails = {
  code: "ITEM-001",
  name: "Sample product",
  categoryId: "category-1",
  brandId: "brand-1",
  price: "999999.99",
  productUnit: "each",
  stockAlert: "0",
  orderTax: "0",
  taxType: "Exclusive" as const,
  quantityLimitation: "",
  notes: "",
};

test("accepts a product price at the maximum", () => {
  assert.equal(productDetailsSchema.safeParse(validProductDetails).success, true);
});

test("rejects product prices above the maximum", () => {
  assert.equal(
    productDetailsSchema.safeParse({ ...validProductDetails, price: "1000000.00" }).success,
    false,
  );
});
