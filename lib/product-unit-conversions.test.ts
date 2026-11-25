import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  getStockConversionFactor,
  StockUnitConversionError,
  toStockQuantity,
} from "./product-unit-conversions";

const product = {
  productUnit: "piece",
  unitConversions: [
    { unit: { name: "box" }, conversionFactor: new Prisma.Decimal("12") },
  ],
};

test("base unit always converts one-to-one", () => {
  assert.equal(getStockConversionFactor(product, "piece").toString(), "1");
});

test("configured alternate units resolve their product-specific factor", () => {
  assert.equal(getStockConversionFactor(product, "box").toString(), "12");
  assert.equal(toStockQuantity("2", "12").toString(), "24");
});

test("unconfigured units are rejected", () => {
  assert.throws(() => getStockConversionFactor(product, "crate"), StockUnitConversionError);
});

test("conversion rejects quantities that exceed stock precision", () => {
  assert.throws(
    () => toStockQuantity("0.001", "0.5"),
    /maximum 3 decimal places/,
  );
});
