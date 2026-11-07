import assert from "node:assert/strict";
import test from "node:test";
import { transferCreateSchema } from "./transfer-create-schema";

const validTransfer = {
  fromWarehouseId: "source",
  toWarehouseId: "destination",
  date: "2026-11-07",
  status: "Completed",
  orderTax: "0.00",
  discount: "0.00",
  shipping: "0.00",
  notes: null,
  items: [{
    productId: "product",
    netUnitCost: "12.50",
    quantity: "1",
    discountType: "Fixed",
    discount: "0.00",
    taxType: "Exclusive",
    orderTax: "0.00",
  }],
};

test("accepts valid transfer input", () => {
  assert.equal(transferCreateSchema.safeParse(validTransfer).success, true);
});

test("rejects a same-warehouse transfer", () => {
  const parsed = transferCreateSchema.safeParse({
    ...validTransfer,
    toWarehouseId: validTransfer.fromWarehouseId,
  });
  assert.equal(parsed.success, false);
});

test("rejects transfer quantities below one or with excess precision", () => {
  for (const quantity of ["0.999", "1.0001"]) {
    const parsed = transferCreateSchema.safeParse({
      ...validTransfer,
      items: [{ ...validTransfer.items[0], quantity }],
    });
    assert.equal(parsed.success, false);
  }
});

test("rejects duplicate products in one transfer", () => {
  const parsed = transferCreateSchema.safeParse({
    ...validTransfer,
    items: [validTransfer.items[0], validTransfer.items[0]],
  });
  assert.equal(parsed.success, false);
});
