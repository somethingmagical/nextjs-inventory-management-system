import {
  Prisma,
  type AdjustmentType,
  type StockMovementSourceType,
  type StockMovementType,
} from "@prisma/client";

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

async function increaseStockBalance(
  transaction: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    supplierId: string | null;
    quantity: Prisma.Decimal;
  },
) {
  const unique = {
    productId_warehouseId: {
      productId: input.productId,
      warehouseId: input.warehouseId,
    },
  };
  const maxQuantity = new Prisma.Decimal("999999999.999");
  if (input.quantity.greaterThan(maxQuantity)) {
    throw new StockQuantityLimitError();
  }

  const updated = await transaction.productStock.updateMany({
    where: {
      ...unique,
      quantity: { lte: maxQuantity.minus(input.quantity) },
    },
    data: { quantity: { increment: input.quantity } },
  });

  if (updated.count === 1) return;

  const existing = await transaction.productStock.findUnique({
    where: unique,
    select: { quantity: true },
  });
  if (existing) {
    throw new StockQuantityLimitError();
  }

  await transaction.productStock.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      supplierId: input.supplierId,
      quantity: input.quantity,
    },
  });
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
    movement: {
      type: StockMovementType;
      sourceType: StockMovementSourceType;
      sourceId: string;
      actorId: string | null;
    };
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
    const updated = await transaction.productStock.updateMany({
      where: { ...unique, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (updated.count !== 1) {
      throw new InsufficientStockError(input.productName, input.documentLabel);
    }
    await transaction.stockMovement.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: quantity.negated(),
        ...input.movement,
      },
    });
    return;
  }

  await increaseStockBalance(transaction, {
    productId: input.productId,
    warehouseId: input.warehouseId,
    supplierId: null,
    quantity,
  });
  await transaction.stockMovement.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity,
      ...input.movement,
    },
  });
}

export async function receivePurchaseStock(
  transaction: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    supplierId: string;
    quantity: string;
    movement: {
      type: StockMovementType;
      sourceType: StockMovementSourceType;
      sourceId: string;
      actorId: string | null;
    };
  },
) {
  const quantity = new Prisma.Decimal(input.quantity);
  await increaseStockBalance(transaction, {
    productId: input.productId,
    warehouseId: input.warehouseId,
    supplierId: input.supplierId,
    quantity,
  });
  await transaction.stockMovement.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity,
      ...input.movement,
    },
  });
}
