import assert from "node:assert/strict";
import test from "node:test";
import { saleReturnCreateSchema } from "./sale-return-schema";

const validReturn = {
  saleId: "sale-1",
  date: "2026-11-07",
  status: "Received",
  orderTax: "0",
  discount: "0",
  shipping: "0",
  notes: null,
  items: [{
    productId: "product-1",
    price: "10.00",
    quantity: "1",
    unit: "piece",
    discountType: "Fixed",
    discount: "0",
    taxType: "Exclusive",
    orderTax: "0",
  }],
};

test("accepts a valid sale return payload", () => {
  assert.equal(saleReturnCreateSchema.safeParse(validReturn).success, true);
});

test("rejects malformed decimal values without throwing", () => {
  const parsed = saleReturnCreateSchema.safeParse({
    ...validReturn,
    orderTax: "not-a-number",
    items: [{ ...validReturn.items[0], quantity: "abc" }],
  });

  assert.equal(parsed.success, false);
});

test("rejects duplicate products in one return", () => {
  const parsed = saleReturnCreateSchema.safeParse({
    ...validReturn,
    items: [validReturn.items[0], validReturn.items[0]],
  });

  assert.equal(parsed.success, false);
});
