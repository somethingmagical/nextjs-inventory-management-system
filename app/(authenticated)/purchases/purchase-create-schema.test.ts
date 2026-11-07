import assert from "node:assert/strict";
import test from "node:test";
import { purchaseCreateSchema } from "./purchase-create-schema";

const validPurchase = {
  warehouseId: "warehouse-1",
  supplierId: "supplier-1",
  date: "2026-11-07",
  status: "Received",
  orderTax: "5.00",
  discount: "2.00",
  shipping: "3.50",
  notes: null,
  items: [{
    productId: "product-1",
    netUnitCost: "12.50",
    quantity: "2.125",
    unit: "piece",
    discountType: "Fixed",
    discount: "1.00",
    taxType: "Exclusive",
    orderTax: "10.00",
  }],
};

test("accepts valid purchase data with decimal quantities and prices", () => {
  assert.equal(purchaseCreateSchema.safeParse(validPurchase).success, true);
});

test("requires at least one purchase item", () => {
  const result = purchaseCreateSchema.safeParse({ ...validPurchase, items: [] });
  assert.equal(result.success, false);
});

test("rejects duplicate products and zero quantities", () => {
  const duplicate = purchaseCreateSchema.safeParse({
    ...validPurchase,
    items: [...validPurchase.items, { ...validPurchase.items[0] }],
  });
  const zeroQuantity = purchaseCreateSchema.safeParse({
    ...validPurchase,
    items: [{ ...validPurchase.items[0], quantity: "0" }],
  });

  assert.equal(duplicate.success, false);
  assert.equal(zeroQuantity.success, false);
});

test("rejects invalid date, excessive precision, and tax rates over 100 percent", () => {
  const invalidDate = purchaseCreateSchema.safeParse({ ...validPurchase, date: "2026-02-30" });
  const excessivePrecision = purchaseCreateSchema.safeParse({
    ...validPurchase,
    items: [{ ...validPurchase.items[0], netUnitCost: "1.234" }],
  });
  const excessiveTax = purchaseCreateSchema.safeParse({
    ...validPurchase,
    orderTax: "100.01",
  });

  assert.equal(invalidDate.success, false);
  assert.equal(excessivePrecision.success, false);
  assert.equal(excessiveTax.success, false);
});
