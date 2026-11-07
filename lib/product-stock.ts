import { Prisma, type AdjustmentType } from "@prisma/client";

export class InsufficientStockError extends Error {
  constructor(productName?: string, documentLabel = "adjustment") {
    super(
      productName
        ? `Not enough stock for ${productName}. The ${documentLabel} was not saved.`
        : `There is not enough stock to reverse this ${documentLabel}. No changes were made.`,
    );
    this.name = "InsufficientStockError";
  }
}

export class StockQuantityLimitError extends Error {
  constructor() {
    super("The resulting stock quantity exceeds the supported limit.");
    this.name = "StockQuantityLimitError";
  }
}

export async function applyStockAdjustment(
  transaction: Prisma.TransactionClient,
  input: {
    productId: string;
    productName: string;
    warehouseId: string;
    quantity: string;
    type: AdjustmentType;
    documentLabel?: string;
  },
) {
  const quantity = new Prisma.Decimal(input.quantity);
  const unique = {
    productId_warehouseId: {
      productId: input.productId,
      warehouseId: input.warehouseId,
    },
  };

  if (input.type === "Subtraction") {
    const stock = await transaction.productStock.findUnique({
      where: unique,
      select: { quantity: true },
    });

    if (!stock || stock.quantity.lessThan(quantity)) {
      throw new InsufficientStockError(input.productName, input.documentLabel);
    }

    await transaction.productStock.upsert({
      where: unique,
      create: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        supplierId: null,
        quantity: stock.quantity.minus(quantity),
      },
      update: { quantity: { decrement: quantity } },
    });
    return;
  }

  const stock = await transaction.productStock.findUnique({
    where: unique,
    select: { quantity: true },
  });
  const maxQuantity = new Prisma.Decimal("999999999.999");
  if ((stock?.quantity ?? new Prisma.Decimal(0)).plus(quantity).greaterThan(maxQuantity)) {
    throw new StockQuantityLimitError();
  }

  await transaction.productStock.upsert({
    where: unique,
    create: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      supplierId: null,
      quantity,
    },
    update: { quantity: { increment: quantity } },
  });
}

export async function receivePurchaseStock(
  transaction: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    supplierId: string;
    quantity: string;
  },
) {
  const quantity = new Prisma.Decimal(input.quantity);
  const unique = {
    productId_warehouseId: {
      productId: input.productId,
      warehouseId: input.warehouseId,
    },
  };
  const stock = await transaction.productStock.findUnique({
    where: unique,
    select: { quantity: true },
  });
  const maxQuantity = new Prisma.Decimal("999999999.999");
  if ((stock?.quantity ?? new Prisma.Decimal(0)).plus(quantity).greaterThan(maxQuantity)) {
    throw new StockQuantityLimitError();
  }

  await transaction.productStock.upsert({
    where: unique,
    create: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      supplierId: input.supplierId,
      quantity,
    },
    update: { quantity: { increment: quantity } },
  });
}
