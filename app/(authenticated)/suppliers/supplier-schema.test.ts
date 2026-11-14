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
  suburb: "",
  zipCode: "1010",
  address: "1 Sample Street",
};

test("allows administrative area and postal code to be omitted", () => {
  assert.equal(supplierSchema.safeParse(validSupplier).success, true);
  const parsed = supplierSchema.safeParse({ ...validSupplier, region: "", zipCode: "" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.region, null);
    assert.equal(parsed.data.zipCode, null);
  }
});

test("allows an optional suburb and stores an empty selection as null", () => {
  const parsed = supplierSchema.safeParse(validSupplier);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.suburb, null);
});
