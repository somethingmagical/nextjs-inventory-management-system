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
  unitConversions: "[]",
  stockAlert: "0",
  orderTax: "0",
  taxType: "Exclusive" as const,
  defaultDiscountType: "Percentage" as const,
  defaultDiscount: "0",
  warehouseDiscounts: "[]",
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

test("accepts an explicit zero warehouse override", () => {
  const parsed = productDetailsSchema.safeParse({
    ...validProductDetails,
    warehouseDiscounts: JSON.stringify([{
      warehouseId: "warehouse-1",
      discountType: "Fixed",
      discount: "0",
    }]),
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.warehouseDiscounts, [{
      warehouseId: "warehouse-1",
      discountType: "Fixed",
      discount: "0",
    }]);
  }
});

test("allows discounts equal to their limits", () => {
  assert.equal(
    productDetailsSchema.safeParse({
      ...validProductDetails,
      defaultDiscount: "100",
    }).success,
    true,
  );
  assert.equal(
    productDetailsSchema.safeParse({
      ...validProductDetails,
      defaultDiscountType: "Fixed",
      defaultDiscount: "999999.99",
    }).success,
    true,
  );
});

test("rejects discounts above the permitted amount", () => {
  assert.equal(
    productDetailsSchema.safeParse({
      ...validProductDetails,
      defaultDiscount: "100.01",
    }).success,
    false,
  );
  assert.equal(
    productDetailsSchema.safeParse({
      ...validProductDetails,
      defaultDiscountType: "Fixed",
      defaultDiscount: "1000000.00",
    }).success,
    false,
  );
});

test("rejects duplicate warehouse overrides", () => {
  assert.equal(
    productDetailsSchema.safeParse({
      ...validProductDetails,
      warehouseDiscounts: JSON.stringify([
        { warehouseId: "warehouse-1", discountType: "Percentage", discount: "5" },
        { warehouseId: "warehouse-1", discountType: "Fixed", discount: "1" },
      ]),
    }).success,
    false,
  );
});

test("rejects invalid warehouse override values", () => {
  assert.equal(
    productDetailsSchema.safeParse({
      ...validProductDetails,
      warehouseDiscounts: JSON.stringify([
        { warehouseId: "warehouse-1", discountType: "Percentage", discount: "100.01" },
      ]),
    }).success,
    false,
  );
  assert.equal(
    productDetailsSchema.safeParse({
      ...validProductDetails,
      warehouseDiscounts: JSON.stringify([
        { warehouseId: "warehouse-1", discountType: "Fixed", discount: "1000000" },
      ]),
    }).success,
    false,
  );
});

test("validates alternate unit conversion factors and duplicate units", () => {
  assert.equal(productDetailsSchema.safeParse({
    ...validProductDetails,
    unitConversions: JSON.stringify([{ unitName: "case", conversionFactor: "12" }]),
  }).success, true);
  assert.equal(productDetailsSchema.safeParse({
    ...validProductDetails,
    unitConversions: JSON.stringify([{ unitName: "case", conversionFactor: "0" }]),
  }).success, false);
  assert.equal(productDetailsSchema.safeParse({
    ...validProductDetails,
    unitConversions: JSON.stringify([
      { unitName: "case", conversionFactor: "12" },
      { unitName: "case", conversionFactor: "24" },
    ]),
  }).success, false);
  assert.equal(productDetailsSchema.safeParse({
    ...validProductDetails,
    unitConversions: JSON.stringify([{ unitName: "each", conversionFactor: "1" }]),
  }).success, false);
});
