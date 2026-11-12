import assert from "node:assert/strict";
import test from "node:test";
import { buildDynamicFilterHref } from "./dynamic-filter-url";

test("dynamic filter changes preserve other filters and reset the page", () => {
  assert.equal(
    buildDynamicFilterHref(
      "/products",
      "q=tea&supplierId=s1&page=5&pageSize=25&sortBy=name&sortOrder=asc",
      "warehouseId",
      "w1",
    ),
    "/products?q=tea&supplierId=s1&pageSize=25&sortBy=name&sortOrder=asc&warehouseId=w1",
  );
});

test("clearing a dynamic filter removes its parameter", () => {
  assert.equal(
    buildDynamicFilterHref("/stock", "warehouseId=w1&categoryId=c1&page=2", "categoryId", ""),
    "/stock?warehouseId=w1",
  );
});

test("dynamic filters can clear incompatible query parameters", () => {
  assert.equal(
    buildDynamicFilterHref("/reports/top-selling-products", "year=2025&month=11&q=tea", "month", "2026-04", ["year"]),
    "/reports/top-selling-products?month=2026-04&q=tea",
  );
});
