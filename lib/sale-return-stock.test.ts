import assert from "node:assert/strict";
import test from "node:test";
import { calculateSaleReturnStockDeltas } from "./sale-return-stock";

test("adds only the increase when a sale return quantity grows", () => {
  const deltas = calculateSaleReturnStockDeltas(
    [{ productId: "product-a", quantity: "2.5" }],
    [{ productId: "product-a", quantity: "4" }],
  );

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].type, "Addition");
  assert.equal(deltas[0].quantity.toString(), "1.5");
});

test("subtracts only the decrease when a return quantity shrinks or a line is removed", () => {
  const deltas = calculateSaleReturnStockDeltas(
    [
      { productId: "product-a", quantity: "4" },
      { productId: "product-b", quantity: "1.25" },
    ],
    [{ productId: "product-a", quantity: "2.5" }],
  );

  assert.deepEqual(
    deltas.map((delta) => [delta.productId, delta.type, delta.quantity.toString()]),
    [
      ["product-a", "Subtraction", "1.5"],
      ["product-b", "Subtraction", "1.25"],
    ],
  );
});

test("does not change stock for unchanged quantities", () => {
  assert.deepEqual(
    calculateSaleReturnStockDeltas(
      [{ productId: "product-a", quantity: "2.500" }],
      [{ productId: "product-a", quantity: "2.5" }],
    ),
    [],
  );
});
