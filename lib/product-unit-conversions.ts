import { Prisma } from "@prisma/client";

export class StockUnitConversionError extends Error {
  constructor(message = "The selected unit is not configured for this product.") {
    super(message);
    this.name = "StockUnitConversionError";
  }
}

export type ProductUnitConversionOption = {
  unit: { name: string };
  conversionFactor: Prisma.Decimal | string;
};

export function getStockConversionFactor(
  product: {
    productUnit: string;
    unitConversions: readonly ProductUnitConversionOption[];
  },
  unitName: string,
) {
  if (unitName === product.productUnit) return new Prisma.Decimal(1);

  const conversion = product.unitConversions.find((option) => option.unit.name === unitName);
  if (!conversion) throw new StockUnitConversionError();

  const factor = new Prisma.Decimal(conversion.conversionFactor);
  if (!factor.isFinite() || !factor.greaterThan(0)) throw new StockUnitConversionError();
  return factor;
}

export function toStockQuantity(quantity: string | Prisma.Decimal, factor: Prisma.Decimal | string) {
  const converted = new Prisma.Decimal(quantity).times(factor);
  const stockPrecision = converted.toDecimalPlaces(3);
  if (!converted.equals(stockPrecision)) {
    throw new StockUnitConversionError(
      "The quantity does not convert cleanly to the product's inventory unit (maximum 3 decimal places).",
    );
  }
  if (converted.greaterThan(new Prisma.Decimal("999999999.999"))) {
    throw new StockUnitConversionError("Converted stock quantity exceeds the supported limit.");
  }
  return converted;
}
