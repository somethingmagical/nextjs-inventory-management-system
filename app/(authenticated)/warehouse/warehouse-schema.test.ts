import assert from "node:assert/strict";
import test from "node:test";
import { warehouseSchema } from "./warehouse-schema";

const validWarehouse = {
  name: "Main Warehouse",
  email: "warehouse@example.com",
  phoneNumber: "+1 555 0100",
  country: "United States",
  city: "Seattle",
  region: "Washington",
  suburb: "",
  zipCode: "98101",
  address: "123 Market Street",
};

test("allows a warehouse without an administrative area", () => {
  const parsed = warehouseSchema.safeParse({ ...validWarehouse, region: undefined });
  const emptyRegion = warehouseSchema.safeParse({ ...validWarehouse, region: "" });

  assert.equal(parsed.success, true);
  assert.equal(emptyRegion.success, true);
  if (emptyRegion.success) assert.equal(emptyRegion.data.region, null);
});

test("trims and validates the selected region", () => {
  const parsed = warehouseSchema.safeParse({ ...validWarehouse, region: "  Washington  " });
  const tooLong = warehouseSchema.safeParse({ ...validWarehouse, region: "r".repeat(101) });

  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.region, "Washington");
  assert.equal(tooLong.success, false);
});

test("allows an optional suburb and stores an empty selection as null", () => {
  const parsed = warehouseSchema.safeParse(validWarehouse);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.suburb, null);
});

test("allows optional postal code and address details", () => {
  const parsed = warehouseSchema.safeParse({ ...validWarehouse, address: "   " });
  const noPostalCode = warehouseSchema.safeParse({ ...validWarehouse, zipCode: "" });
  const tooLong = warehouseSchema.safeParse({ ...validWarehouse, address: "a".repeat(192) });

  assert.equal(parsed.success, true);
  assert.equal(noPostalCode.success, true);
  if (noPostalCode.success) assert.equal(noPostalCode.data.zipCode, null);
  assert.equal(tooLong.success, false);
});
