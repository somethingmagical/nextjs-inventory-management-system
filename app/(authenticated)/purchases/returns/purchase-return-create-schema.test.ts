import assert from "node:assert/strict";
import test from "node:test";
import { purchaseReturnCreateSchema } from "./purchase-return-create-schema";

const validPurchaseReturn = {
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

test("accepts valid return data with decimal quantities and prices", () => {
  assert.equal(purchaseReturnCreateSchema.safeParse(validPurchaseReturn).success, true);
});

test("requires at least one return item and rejects duplicate products", () => {
  const empty = purchaseReturnCreateSchema.safeParse({ ...validPurchaseReturn, items: [] });
  const duplicate = purchaseReturnCreateSchema.safeParse({
    ...validPurchaseReturn,
    items: [...validPurchaseReturn.items, { ...validPurchaseReturn.items[0] }],
  });

  assert.equal(empty.success, false);
  assert.equal(duplicate.success, false);
});

test("rejects zero quantities, invalid dates, excessive precision, and tax rates over 100 percent", () => {
  const zeroQuantity = purchaseReturnCreateSchema.safeParse({
    ...validPurchaseReturn,
    items: [{ ...validPurchaseReturn.items[0], quantity: "0" }],
  });
  const invalidDate = purchaseReturnCreateSchema.safeParse({
    ...validPurchaseReturn,
    date: "2026-02-30",
  });
  const excessivePrecision = purchaseReturnCreateSchema.safeParse({
    ...validPurchaseReturn,
    items: [{ ...validPurchaseReturn.items[0], netUnitCost: "1.234" }],
  });
  const excessiveTax = purchaseReturnCreateSchema.safeParse({
    ...validPurchaseReturn,
    orderTax: "100.01",
  });

  assert.equal(zeroQuantity.success, false);
  assert.equal(invalidDate.success, false);
  assert.equal(excessivePrecision.success, false);
  assert.equal(excessiveTax.success, false);
});
