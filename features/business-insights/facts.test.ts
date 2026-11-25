import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBusinessInsightFacts,
  getBusinessInsightPeriods,
} from "./facts";

test("business insight periods cover the last two completed UTC weeks", () => {
  const periods = getBusinessInsightPeriods(new Date("2026-11-25T20:00:00.000Z"));

  assert.equal(periods.current.start.toISOString(), "2026-11-18T00:00:00.000Z");
  assert.equal(periods.current.end.toISOString(), "2026-11-25T00:00:00.000Z");
  assert.equal(periods.previous.start.toISOString(), "2026-11-11T00:00:00.000Z");
  assert.equal(periods.previous.end.toISOString(), "2026-11-18T00:00:00.000Z");
});

test("business insight facts use application totals and omit empty categories", () => {
  const periods = getBusinessInsightPeriods(new Date("2026-11-25T20:00:00.000Z"));
  const facts = buildBusinessInsightFacts({
    sales: { current: "1200.00", previous: "1000.00" },
    expenses: { current: "0.00", previous: "0.00" },
    receivables: "320.50",
    lowStockPositions: 2,
    periods,
  });

  assert.deepEqual(facts.map(({ id }) => id), ["sales", "receivables", "stock"]);
  assert.match(facts[0].evidence, /\$1,200\.00/);
  assert.match(facts[0].evidence, /higher in the current period/);
  assert.match(facts[1].evidence, /\$320\.50/);
  assert.match(facts[2].evidence, /2 product-and-warehouse stock positions/);
});

test("business insight facts omit all-zero comparisons", () => {
  const periods = getBusinessInsightPeriods(new Date("2026-11-25T20:00:00.000Z"));
  const facts = buildBusinessInsightFacts({
    sales: { current: "0.00", previous: "0.00" },
    expenses: { current: "0.00", previous: "0.00" },
    receivables: "0.00",
    lowStockPositions: 0,
    periods,
  });

  assert.deepEqual(facts, []);
});

test("business insight comparisons order negative sales totals correctly", () => {
  const periods = getBusinessInsightPeriods(new Date("2026-11-25T20:00:00.000Z"));
  const facts = buildBusinessInsightFacts({
    sales: { current: "-50.00", previous: "-100.00" },
    expenses: { current: "0.00", previous: "0.00" },
    receivables: "0.00",
    lowStockPositions: 0,
    periods,
  });

  assert.match(facts[0].evidence, /\$-50\.00/);
  assert.match(facts[0].evidence, /higher in the current period/);
});
