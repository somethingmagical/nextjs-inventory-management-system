import { Prisma } from "@prisma/client";

type DecimalInput = string | Prisma.Decimal;
type PurchaseDiscountType = "Fixed" | "Percentage";
type PurchaseTaxType = "Inclusive" | "Exclusive";

type PurchaseLineInput = {
  unitCost: DecimalInput;
  quantity: DecimalInput;
  discountType: PurchaseDiscountType;
  discount: DecimalInput;
  taxType: PurchaseTaxType;
  taxRate: DecimalInput;
};

type PurchaseTotalsInput = {
  lineSubtotals: readonly DecimalInput[];
  orderTaxRate: DecimalInput;
  discount: DecimalInput;
  shipping: DecimalInput;
};

const moneyScale = 2;
const hundred = new Prisma.Decimal(100);

function decimal(value: DecimalInput, label: string) {
  let result: Prisma.Decimal;

  try {
    result = new Prisma.Decimal(value);
  } catch {
    throw new RangeError(`${label} must be a finite decimal value.`);
  }

  if (!result.isFinite()) {
    throw new RangeError(`${label} must be a finite decimal value.`);
  }
  if (result.isNegative()) {
    throw new RangeError(`${label} cannot be negative.`);
  }

  return result;
}

function roundMoney(value: Prisma.Decimal) {
  return value.toDecimalPlaces(moneyScale, Prisma.Decimal.ROUND_HALF_UP);
}

function validateRate(value: DecimalInput, label: string) {
  const rate = decimal(value, label);
  if (rate.greaterThan(100)) {
    throw new RangeError(`${label} cannot exceed 100%.`);
  }
  return rate;
}

export function calculatePurchaseLineTotals(input: PurchaseLineInput) {
  const unitCost = decimal(input.unitCost, "Unit cost");
  const quantity = decimal(input.quantity, "Quantity");
  const discountValue = decimal(input.discount, "Line discount");
  const taxRate = validateRate(input.taxRate, "Line tax rate");

  if (quantity.isZero()) {
    throw new RangeError("Quantity must be greater than zero.");
  }

  const gross = roundMoney(unitCost.times(quantity));
  const discount = input.discountType === "Percentage"
    ? roundMoney(gross.times(discountValue).dividedBy(hundred))
    : roundMoney(discountValue);

  if (input.discountType === "Percentage" && discountValue.greaterThan(hundred)) {
    throw new RangeError("Percentage discount cannot exceed 100%.");
  }
  if (discount.greaterThan(gross)) {
    throw new RangeError("Line discount cannot exceed the line amount.");
  }

  const discountedAmount = roundMoney(gross.minus(discount));
  const tax = input.taxType === "Inclusive"
    ? roundMoney(
        discountedAmount.minus(
          discountedAmount.dividedBy(new Prisma.Decimal(1).plus(taxRate.dividedBy(hundred))),
        ),
      )
    : roundMoney(discountedAmount.times(taxRate).dividedBy(hundred));
  const subtotal = input.taxType === "Inclusive"
    ? discountedAmount
    : roundMoney(discountedAmount.plus(tax));

  return { gross, discount, tax, subtotal };
}

export function calculatePurchaseTotals(input: PurchaseTotalsInput) {
  const lineSubtotal = input.lineSubtotals.reduce<Prisma.Decimal>(
    (total, value, index) => total.plus(decimal(value, `Line subtotal ${index + 1}`)),
    new Prisma.Decimal(0),
  );
  const subtotal = roundMoney(lineSubtotal);
  const orderTaxRate = validateRate(input.orderTaxRate, "Order tax rate");
  const orderTax = roundMoney(subtotal.times(orderTaxRate).dividedBy(hundred));
  const discount = roundMoney(decimal(input.discount, "Order discount"));
  const shipping = roundMoney(decimal(input.shipping, "Shipping"));
  const totalBeforeDiscount = roundMoney(subtotal.plus(orderTax));

  if (discount.greaterThan(totalBeforeDiscount)) {
    throw new RangeError("Order discount cannot exceed the subtotal and order tax.");
  }

  const grandTotal = roundMoney(totalBeforeDiscount.minus(discount).plus(shipping));

  return { subtotal, orderTax, discount, shipping, grandTotal };
}
