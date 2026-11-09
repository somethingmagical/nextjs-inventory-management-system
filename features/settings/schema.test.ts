import assert from "node:assert/strict";
import test from "node:test";
import { applicationNameSchema } from "./schema";

test("application names are trimmed and retained", () => {
  assert.equal(applicationNameSchema.parse("  Warehouse  "), "Warehouse");
});

test("application names cannot be empty or exceed the metadata limit", () => {
  assert.equal(applicationNameSchema.safeParse("  ").success, false);
  assert.equal(applicationNameSchema.safeParse("W".repeat(101)).success, false);
});
