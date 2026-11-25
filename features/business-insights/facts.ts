import type { BusinessInsightFact } from "./schema";

const DAYS_IN_PERIOD = 7;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function getBusinessInsightPeriods(now: Date) {
  const endOfCurrentPeriod = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const startOfCurrentPeriod = new Date(endOfCurrentPeriod);
  startOfCurrentPeriod.setUTCDate(
    startOfCurrentPeriod.getUTCDate() - DAYS_IN_PERIOD,
  );
  const startOfPreviousPeriod = new Date(startOfCurrentPeriod);
  startOfPreviousPeriod.setUTCDate(
    startOfPreviousPeriod.getUTCDate() - DAYS_IN_PERIOD,
  );

  return {
    current: { start: startOfCurrentPeriod, end: endOfCurrentPeriod },
    previous: { start: startOfPreviousPeriod, end: startOfCurrentPeriod },
  };
}

function parseCurrency(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new TypeError("Business insight currency values must have at most two decimals.");
  }

  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const isZero = whole === "0" && fraction === "00";
  return {
    negative: match[1] === "-" && !isZero,
    whole,
    fraction,
  };
}

function formatCurrency(value: string): string {
  const amount = parseCurrency(value);
  const whole = amount.whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${amount.negative ? "-" : ""}${whole}.${amount.fraction}`;
}

function periodLabel(start: Date, end: Date): string {
  const lastDay = new Date(end.getTime() - DAY_IN_MILLISECONDS);
  return `${start.toISOString().slice(0, 10)} through ${lastDay.toISOString().slice(0, 10)}`;
}

function compareDirection(current: string, previous: string): string {
  const currentAmount = parseCurrency(current);
  const previousAmount = parseCurrency(previous);
  if (currentAmount.negative !== previousAmount.negative) {
    return currentAmount.negative ? "lower" : "higher";
  }

  const sign = currentAmount.negative ? -1 : 1;
  const wholeOrder = currentAmount.whole.length === previousAmount.whole.length
    ? currentAmount.whole === previousAmount.whole
      ? 0
      : currentAmount.whole < previousAmount.whole ? -1 : 1
    : currentAmount.whole.length < previousAmount.whole.length ? -1 : 1;
  const fractionOrder = currentAmount.fraction === previousAmount.fraction
    ? 0
    : currentAmount.fraction < previousAmount.fraction ? -1 : 1;
  const magnitudeOrder = wholeOrder || fractionOrder;
  const amountOrder = magnitudeOrder * sign;
  if (amountOrder > 0) return "higher";
  if (amountOrder < 0) return "lower";
  return "unchanged";
}

function comparisonFact(input: {
  id: "sales" | "expenses";
  title: string;
  current: string;
  previous: string;
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
}): BusinessInsightFact | undefined {
  const current = parseCurrency(input.current);
  const previous = parseCurrency(input.previous);
  if (
    current.whole === "0"
    && current.fraction === "00"
    && previous.whole === "0"
    && previous.fraction === "00"
  ) {
    return undefined;
  }

  const direction = compareDirection(input.current, input.previous);
  return {
    id: input.id,
    title: input.title,
    evidence:
      `${formatCurrency(input.current)} for ${periodLabel(input.currentStart, input.currentEnd)}; `
      + `${formatCurrency(input.previous)} for ${periodLabel(input.previousStart, input.previousEnd)} `
      + `(${direction} in the current period).`,
  };
}

export function buildBusinessInsightFacts(input: {
  sales: { current: string; previous: string };
  expenses: { current: string; previous: string };
  receivables: string;
  lowStockPositions: number;
  periods: ReturnType<typeof getBusinessInsightPeriods>;
}): BusinessInsightFact[] {
  const facts = [
    comparisonFact({
      id: "sales",
      title: "Sales after received returns",
      current: input.sales.current,
      previous: input.sales.previous,
      currentStart: input.periods.current.start,
      currentEnd: input.periods.current.end,
      previousStart: input.periods.previous.start,
      previousEnd: input.periods.previous.end,
    }),
    comparisonFact({
      id: "expenses",
      title: "Expenses",
      current: input.expenses.current,
      previous: input.expenses.previous,
      currentStart: input.periods.current.start,
      currentEnd: input.periods.current.end,
      previousStart: input.periods.previous.start,
      previousEnd: input.periods.previous.end,
    }),
  ];

  const receivables = parseCurrency(input.receivables);
  if (!receivables.negative && (receivables.whole !== "0" || receivables.fraction !== "00")) {
    facts.push({
      id: "receivables",
      title: "Outstanding received-sale balances",
      evidence: `${formatCurrency(input.receivables)} is currently due on received sales.`,
    });
  }

  if (!Number.isSafeInteger(input.lowStockPositions) || input.lowStockPositions < 0) {
    throw new TypeError("Low-stock position count must be a non-negative safe integer.");
  }
  if (input.lowStockPositions > 0) {
    facts.push({
      id: "stock",
      title: "Low-stock positions",
      evidence: `${input.lowStockPositions} product-and-warehouse stock positions are at or below their alert quantity.`,
    });
  }

  return facts.filter((fact): fact is BusinessInsightFact => fact !== undefined);
}
