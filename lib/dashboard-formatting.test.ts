import assert from "node:assert/strict";
import test from "node:test";
import { formatDashboardCurrency } from "./dashboard-formatting";

test("dashboard currency keeps cents for amounts below one thousand", () => {
  assert.equal(formatDashboardCurrency("999.99"), "$ 999.99");
  assert.equal(formatDashboardCurrency("0"), "$ 0.00");
});

test("dashboard currency compacts thousands and millions to fit KPI cards", () => {
  assert.equal(formatDashboardCurrency("480997.00"), "$ 481K");
  assert.equal(formatDashboardCurrency("4800000.00"), "$ 4.8M");
  assert.equal(formatDashboardCurrency("999999.00"), "$ 1M");
});

test("dashboard currency rejects non-finite values", () => {
  assert.throws(() => formatDashboardCurrency("not-a-number"), TypeError);
});
