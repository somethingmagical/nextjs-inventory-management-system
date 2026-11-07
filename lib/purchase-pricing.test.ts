import assert from "node:assert/strict";
import test from "node:test";
import { calculatePurchaseLineTotals, calculatePurchaseTotals } from "./purchase-pricing";

test("calculates an exclusive-tax line after a fixed discount using decimal arithmetic", () => {
  const totals = calculatePurchaseLineTotals({
    unitCost: "100.00",
    quantity: "2",
    discountType: "Fixed",
    discount: "10.00",
    taxType: "Exclusive",
    taxRate: "10",
  });

  assert.equal(totals.gross.toFixed(2), "200.00");
  assert.equal(totals.discount.toFixed(2), "10.00");
  assert.equal(totals.tax.toFixed(2), "19.00");
  assert.equal(totals.subtotal.toFixed(2), "209.00");
});

test("extracts tax from an inclusive-tax line without adding it twice", () => {
  const totals = calculatePurchaseLineTotals({
    unitCost: "110.00",
    quantity: "1",
    discountType: "Fixed",
    discount: "0",
    taxType: "Inclusive",
    taxRate: "10",
  });

  assert.equal(totals.tax.toFixed(2), "10.00");
  assert.equal(totals.subtotal.toFixed(2), "110.00");
});

test("applies percentage discounts before exclusive tax", () => {
  const totals = calculatePurchaseLineTotals({
    unitCost: "50",
    quantity: "2",
    discountType: "Percentage",
    discount: "10",
    taxType: "Exclusive",
    taxRate: "5",
  });

  assert.equal(totals.discount.toFixed(2), "10.00");
  assert.equal(totals.tax.toFixed(2), "4.50");
  assert.equal(totals.subtotal.toFixed(2), "94.50");
});

test("calculates order tax, discount, shipping, and grand total", () => {
  const totals = calculatePurchaseTotals({
    lineSubtotals: ["209.00", "110.00"],
    orderTaxRate: "10",
    discount: "5",
    shipping: "3",
  });

  assert.equal(totals.subtotal.toFixed(2), "319.00");
  assert.equal(totals.orderTax.toFixed(2), "31.90");
  assert.equal(totals.discount.toFixed(2), "5.00");
  assert.equal(totals.shipping.toFixed(2), "3.00");
  assert.equal(totals.grandTotal.toFixed(2), "348.90");
});

test("rounds monetary results to two decimals", () => {
  const totals = calculatePurchaseLineTotals({
    unitCost: "0.10",
    quantity: "3",
    discountType: "Fixed",
    discount: "0",
    taxType: "Exclusive",
    taxRate: "8.25",
  });

  assert.equal(totals.gross.toFixed(2), "0.30");
  assert.equal(totals.tax.toFixed(2), "0.02");
  assert.equal(totals.subtotal.toFixed(2), "0.32");
});

test("rejects discounts that exceed the line amount and negative order totals", () => {
  assert.throws(
    () => calculatePurchaseLineTotals({
      unitCost: "10",
      quantity: "1",
      discountType: "Fixed",
      discount: "11",
      taxType: "Exclusive",
      taxRate: "0",
    }),
    RangeError,
  );
  assert.throws(
    () => calculatePurchaseTotals({
      lineSubtotals: ["10"],
      orderTaxRate: "0",
      discount: "11",
      shipping: "0",
    }),
    RangeError,
  );
});
