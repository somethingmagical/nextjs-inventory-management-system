const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatDashboardCurrency(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new TypeError("Dashboard currency values must be finite numbers.");
  }

  const formatted =
    Math.abs(amount) >= 1_000
      ? compactCurrencyFormatter.format(amount)
      : amount.toFixed(2);

  return `$ ${formatted}`;
}
