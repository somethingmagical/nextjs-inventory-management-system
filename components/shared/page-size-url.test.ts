import assert from "node:assert/strict";
import test from "node:test";
import { buildPageSizeHref } from "./page-size-url";

test("page-size navigation preserves filters and resets pagination", () => {
  assert.equal(
    buildPageSizeHref("/products", "?q=coffee&warehouseId=warehouse-1&page=4", 25),
    "/products?q=coffee&warehouseId=warehouse-1&pageSize=25",
  );
});

test("the default page size is omitted from the URL", () => {
  assert.equal(
    buildPageSizeHref("/customers", "?q=Jordan&page=2&pageSize=50", 10),
    "/customers?q=Jordan",
  );
});
