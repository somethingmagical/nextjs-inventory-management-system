import assert from "node:assert/strict";
import test from "node:test";
import {
  hasUserHistoryFilters,
  parseUserHistoryFilters,
  toUserHistorySearchParams,
} from "./history-filter-values";

test("user history filters accept valid query, action, and date range", () => {
  const parsed = parseUserHistoryFilters({
    q: "manager",
    action: "updated",
    from: "2026-01-01",
    to: "2026-01-31",
  });

  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(hasUserHistoryFilters(parsed.data), true);
});

test("user history filters reject invalid actions, dates, and reversed ranges", () => {
  assert.equal(parseUserHistoryFilters({ action: "removed" }).success, false);
  assert.equal(parseUserHistoryFilters({ from: "2026-02-30" }).success, false);
  assert.equal(parseUserHistoryFilters({ from: "2026-02-02", to: "2026-02-01" }).success, false);
});

test("user history pagination and download links preserve active filters", () => {
  const filters = {
    q: "Sam User",
    action: "updated" as const,
    from: "2026-01-01",
    to: "",
  };
  const params = toUserHistorySearchParams(filters, 2);

  assert.equal(params.get("q"), "Sam User");
  assert.equal(params.get("action"), "updated");
  assert.equal(params.get("from"), "2026-01-01");
  assert.equal(params.get("page"), "2");
});
