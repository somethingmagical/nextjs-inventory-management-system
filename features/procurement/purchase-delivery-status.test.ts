import assert from "node:assert/strict";
import test from "node:test";
import { getInitialPurchaseDeliveryStatus } from "./purchase-delivery-status";

test("received purchases start delivered while open purchases start pending", () => {
  assert.equal(getInitialPurchaseDeliveryStatus("Received"), "Delivered");
  assert.equal(getInitialPurchaseDeliveryStatus("Ordered"), "Pending");
  assert.equal(getInitialPurchaseDeliveryStatus("Pending"), "Pending");
});
