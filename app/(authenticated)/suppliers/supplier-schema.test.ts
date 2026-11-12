import assert from "node:assert/strict";
import test from "node:test";
import { supplierSchema } from "./supplier-schema";

const validSupplier = {
  name: "Sample Supplier",
  email: "supplier@example.com",
  phoneNumber: "+64 21 123 4567",
  country: "New Zealand",
  region: "Auckland",
  city: "Auckland",
  zipCode: "1010",
  address: "1 Sample Street",
};

test("requires region and postal code for suppliers", () => {
  assert.equal(supplierSchema.safeParse(validSupplier).success, true);
  assert.equal(supplierSchema.safeParse({ ...validSupplier, region: "" }).success, false);
  assert.equal(supplierSchema.safeParse({ ...validSupplier, zipCode: "" }).success, false);
});
