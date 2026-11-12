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
  zipCode: "98101",
  address: "123 Market Street",
};

test("requires a region before accepting a warehouse", () => {
  const parsed = warehouseSchema.safeParse({ ...validWarehouse, region: undefined });
  const emptyRegion = warehouseSchema.safeParse({ ...validWarehouse, region: "" });

  assert.equal(parsed.success, false);
  assert.equal(emptyRegion.success, false);
});

test("trims and validates the selected region", () => {
  const parsed = warehouseSchema.safeParse({ ...validWarehouse, region: "  Washington  " });
  const tooLong = warehouseSchema.safeParse({ ...validWarehouse, region: "r".repeat(101) });

  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.region, "Washington");
  assert.equal(tooLong.success, false);
});

test("requires an address before accepting a warehouse", () => {
  const parsed = warehouseSchema.safeParse({ ...validWarehouse, address: "   " });
  const tooLong = warehouseSchema.safeParse({ ...validWarehouse, address: "a".repeat(192) });

  assert.equal(parsed.success, false);
  assert.equal(tooLong.success, false);
});
