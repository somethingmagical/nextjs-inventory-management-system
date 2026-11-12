import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTableSortHref,
  getNextSortOrder,
  parseSortBy,
  parseSortOrder,
} from "./table-sorting";

test("sort href preserves filters and page size while resetting pagination", () => {
  assert.equal(
    buildTableSortHref({
      pathname: "/sales",
      searchParams: {
        q: "coffee",
        date: "2026-11-13",
        page: "4",
        pageSize: "25",
      },
      sortBy: "reference",
      sortOrder: "asc",
    }),
    "/sales?q=coffee&date=2026-11-13&pageSize=25&sortBy=reference&sortOrder=asc",
  );
});

test("sort state only accepts allow-listed keys and known directions", () => {
  assert.equal(parseSortBy("reference", ["createdAt", "reference"], "createdAt"), "reference");
  assert.equal(parseSortBy("unsafe", ["createdAt", "reference"], "createdAt"), "createdAt");
  assert.equal(parseSortOrder("asc"), "asc");
  assert.equal(parseSortOrder("ascending"), "desc");
});

test("sort toggles ascending first and alternates the current column", () => {
  assert.equal(getNextSortOrder("name", "createdAt", "desc"), "asc");
  assert.equal(getNextSortOrder("name", "name", "asc"), "desc");
});
