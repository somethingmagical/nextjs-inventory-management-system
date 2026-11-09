import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type AdjustmentType } from "@prisma/client";
import {
  applyStockAdjustment,
  InsufficientStockError,
  receivePurchaseStock,
  StockQuantityLimitError,
} from "./product-stock";

function createTransaction(initialQuantity?: string, initialSupplierId: string | null = null) {
  let stock = initialQuantity === undefined
    ? null
    : {
        quantity: new Prisma.Decimal(initialQuantity),
        supplierId: initialSupplierId,
      };
  const writes: { create?: { supplierId: string | null }; update?: object }[] = [];
  const movementWrites: {
    data: {
      productId: string;
      warehouseId: string;
      quantity: Prisma.Decimal;
      type: string;
      sourceType: string;
      sourceId: string;
      actorId: string | null;
    };
  }[] = [];

  const transaction = {
    productStock: {
      findUnique: async () => stock && { quantity: stock.quantity },
      updateMany: async (input: {
        where: { quantity?: { gte?: Prisma.Decimal; lte?: Prisma.Decimal } };
        data: { quantity: { increment?: Prisma.Decimal; decrement?: Prisma.Decimal } };
      }) => {
        if (!stock) return { count: 0 };
        if (input.where.quantity?.gte && stock.quantity.lessThan(input.where.quantity.gte)) {
          return { count: 0 };
        }
        if (input.where.quantity?.lte && stock.quantity.greaterThan(input.where.quantity.lte)) {
          return { count: 0 };
        }
        writes.push({ update: input.data.quantity });
        const quantity = input.data.quantity.increment
          ? stock.quantity.plus(input.data.quantity.increment)
          : input.data.quantity.decrement
            ? stock.quantity.minus(input.data.quantity.decrement)
            : stock.quantity;
        stock = {
          quantity,
          supplierId: stock.supplierId,
        };
        return { count: 1 };
      },
      create: async (input: {
        data: { quantity: Prisma.Decimal; supplierId: string | null };
      }) => {
        writes.push({ create: { supplierId: input.data.supplierId } });
        stock = {
          quantity: input.data.quantity,
          supplierId: input.data.supplierId,
        };
        return stock;
      },
    },
    stockMovement: {
      create: async (input: (typeof movementWrites)[number]) => {
        movementWrites.push(input);
      },
    },
  };

  return {
    transaction: transaction as unknown as Prisma.TransactionClient,
    quantity: () => stock?.quantity.toString() ?? null,
    supplierId: () => stock?.supplierId ?? null,
    writes,
    movementWrites,
  };
}

const movement = {
  type: "Sale" as const,
  sourceType: "Sale" as const,
  sourceId: "sale-1",
  actorId: "user-1",
};

test("stock subtraction changes the transaction balance by exact decimal quantity", async () => {
  const fake = createTransaction("8.125");

  await applyStockAdjustment(fake.transaction, {
    productId: "product-1",
    productName: "Widget",
    warehouseId: "warehouse-1",
    quantity: "2.025",
    type: "Subtraction",
    movement,
  });

  assert.equal(fake.quantity(), "6.1");
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.movementWrites.length, 1);
  assert.equal(fake.movementWrites[0].data.quantity.toString(), "-2.025");
});

test("insufficient stock rejects without writing a balance", async () => {
  const fake = createTransaction("1.5");

  await assert.rejects(
    applyStockAdjustment(fake.transaction, {
      productId: "product-1",
      productName: "Widget",
      warehouseId: "warehouse-1",
      quantity: "2",
      type: "Subtraction",
      movement,
    }),
    InsufficientStockError,
  );

  assert.equal(fake.quantity(), "1.5");
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.movementWrites.length, 0);
});

test("stock additions reject quantities beyond the database decimal capacity", async () => {
  const fake = createTransaction("999999999.999");

  await assert.rejects(
    applyStockAdjustment(fake.transaction, {
      productId: "product-1",
      productName: "Widget",
      warehouseId: "warehouse-1",
      quantity: "0.001",
      type: "Addition",
      movement,
    }),
    StockQuantityLimitError,
  );

  assert.equal(fake.quantity(), "999999999.999");
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.movementWrites.length, 0);
});

test("purchase receipt adds exact quantity and keeps the original supplier on an existing balance", async () => {
  const fake = createTransaction("3.25", "supplier-original");

  await receivePurchaseStock(fake.transaction, {
    productId: "product-1",
    warehouseId: "warehouse-1",
    supplierId: "supplier-new",
    quantity: "1.125",
    movement: {
      ...movement,
      type: "PurchaseReceipt",
      sourceType: "Purchase",
      sourceId: "purchase-1",
    },
  });

  assert.equal(fake.quantity(), "4.375");
  assert.equal(fake.supplierId(), "supplier-original");
  assert.equal(fake.movementWrites[0].data.quantity.toString(), "1.125");
  assert.equal(fake.movementWrites[0].data.sourceId, "purchase-1");
});

test("stock additions create an initial balance when none exists", async () => {
  const fake = createTransaction();

  await receivePurchaseStock(fake.transaction, {
    productId: "product-1",
    warehouseId: "warehouse-1",
    supplierId: "supplier-1",
    quantity: "1.25",
    movement: {
      ...movement,
      type: "PurchaseReceipt",
      sourceType: "Purchase",
      sourceId: "purchase-1",
    },
  });

  assert.equal(fake.quantity(), "1.25");
  assert.equal(fake.supplierId(), "supplier-1");
  assert.equal(fake.movementWrites.length, 1);
});

test("stock adjustment accepts both adjustment types", async (t) => {
  const cases: { type: AdjustmentType; start: string; quantity: string; expected: string }[] = [
    { type: "Addition", start: "2", quantity: "0.125", expected: "2.125" },
    { type: "Subtraction", start: "2", quantity: "0.125", expected: "1.875" },
  ];

  for (const [index, item] of cases.entries()) {
    await t.test(item.type, async () => {
      const fake = createTransaction(item.start);
      await applyStockAdjustment(fake.transaction, {
        productId: `product-${index}`,
        productName: "Widget",
        warehouseId: "warehouse-1",
        quantity: item.quantity,
        type: item.type,
        movement,
      });
      assert.equal(fake.quantity(), item.expected);
      assert.equal(fake.movementWrites.length, 1);
      assert.equal(
        fake.movementWrites[0].data.quantity.toString(),
        item.type === "Addition" ? item.quantity : `-${item.quantity}`,
      );
    });
  }
});
