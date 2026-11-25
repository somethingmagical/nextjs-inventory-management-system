import {
  Prisma,
  type AdjustmentType,
  type ProductStockStatus,
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

export class StockBalanceChangedError extends Error {
  constructor() {
    super("Stock changed while saving. Refresh the page and try again.");
    this.name = "StockBalanceChangedError";
  }
}

async function increaseStockBalance(
  transaction: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    supplierId: string | null;
    status: ProductStockStatus;
    quantity: Prisma.Decimal;
    expectedQuantity?: Prisma.Decimal;
  },
) {
  const unique = {
    productId_warehouseId_status: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      status: input.status,
    },
  };
  const maxQuantity = new Prisma.Decimal("999999999.999");
  if (input.quantity.greaterThan(maxQuantity)) {
    throw new StockQuantityLimitError();
  }

  const updated = await transaction.productStock.updateMany({
    where: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      status: input.status,
      quantity: {
        lte: maxQuantity.minus(input.quantity),
        ...(input.expectedQuantity ? { equals: input.expectedQuantity } : {}),
      },
    },
    data: { quantity: { increment: input.quantity } },
  });

  if (updated.count === 1) return;

  const existing = await transaction.productStock.findUnique({
    where: unique,
    select: { quantity: true },
  });
  if (existing) {
    if (input.expectedQuantity) throw new StockBalanceChangedError();
    throw new StockQuantityLimitError();
  }

  await transaction.productStock.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      supplierId: input.supplierId,
      status: input.status,
      quantity: input.quantity,
    },
  });
}

async function decreaseStockBalance(
  transaction: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    status: ProductStockStatus;
    quantity: Prisma.Decimal;
    expectedQuantity?: Prisma.Decimal;
    respectReservations: boolean;
    productName?: string;
    documentLabel?: string;
  },
) {
  const unique = {
    productId_warehouseId_status: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      status: input.status,
    },
  };
  const stock = await transaction.productStock.findUnique({
    where: unique,
    select: { quantity: true, reservedQuantity: true },
  });
  if (!stock) throw new InsufficientStockError(input.productName, input.documentLabel);
  if (input.expectedQuantity && !stock.quantity.equals(input.expectedQuantity)) {
    throw new StockBalanceChangedError();
  }

  const available = input.respectReservations
    ? stock.quantity.minus(stock.reservedQuantity)
    : stock.quantity;
  if (available.lessThan(input.quantity)) {
    throw new InsufficientStockError(input.productName, input.documentLabel);
  }

  const updated = await transaction.productStock.updateMany({
    where: {
      ...unique.productId_warehouseId_status,
      quantity: { equals: stock.quantity },
      reservedQuantity: { equals: stock.reservedQuantity },
    },
    data: { quantity: { decrement: input.quantity } },
  });
  if (updated.count !== 1) throw new StockBalanceChangedError();
}

export async function applyStockBucketAdjustment(
  transaction: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    status: ProductStockStatus;
    quantity: string;
    type: AdjustmentType;
    supplierId?: string | null;
  },
) {
  const quantity = new Prisma.Decimal(input.quantity);
  if (input.type === "Addition") {
    await increaseStockBalance(transaction, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      supplierId: input.supplierId ?? null,
      status: input.status,
      quantity,
    });
    return;
  }

  await decreaseStockBalance(transaction, {
    productId: input.productId,
    warehouseId: input.warehouseId,
    status: input.status,
    quantity,
    respectReservations: false,
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
    expectedQuantity?: Prisma.Decimal;
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

  if (input.type === "Subtraction") {
    await decreaseStockBalance(transaction, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      status: "Received",
      quantity,
      expectedQuantity: input.expectedQuantity,
      respectReservations: true,
      productName: input.productName,
      documentLabel: input.documentLabel,
    });
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
    status: "Received",
    quantity,
    expectedQuantity: input.expectedQuantity,
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

export async function reserveStock(
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
  const where = {
    productId_warehouseId_status: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      status: "Received" as const,
    },
  };
  const stock = await transaction.productStock.findUnique({
    where,
    select: { quantity: true, reservedQuantity: true },
  });
  if (!stock) {
    if (input.type === "Subtraction") {
      throw new InsufficientStockError(input.productName, input.documentLabel);
    }
    throw new StockBalanceChangedError();
  }

  if (input.type === "Addition") {
    if (stock.quantity.minus(stock.reservedQuantity).lessThan(quantity)) {
      throw new InsufficientStockError(input.productName, input.documentLabel);
    }
  } else if (stock.reservedQuantity.lessThan(quantity)) {
    throw new StockBalanceChangedError();
  }

  const updated = await transaction.productStock.updateMany({
    where: {
      ...where.productId_warehouseId_status,
      quantity: { equals: stock.quantity },
      reservedQuantity: input.type === "Addition"
        ? { equals: stock.reservedQuantity }
        : { equals: stock.reservedQuantity, gte: quantity },
    },
    data: {
      reservedQuantity: input.type === "Addition"
        ? { increment: quantity }
        : { decrement: quantity },
    },
  });
  if (updated.count !== 1) throw new StockBalanceChangedError();
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
    status: "Received",
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
