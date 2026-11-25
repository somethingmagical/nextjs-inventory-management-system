import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type AdjustmentType } from "@prisma/client";
import {
  applySaleStockAdjustments,
  applyStockAdjustment,
  applyStockBucketAdjustment,
  InsufficientStockError,
  reserveStock,
  receivePurchaseStock,
  StockQuantityLimitError,
} from "./product-stock";

function createTransaction(
  initialQuantity?: string,
  initialSupplierId: string | null = null,
  initialReservedQuantity = "0",
) {
  let stock = initialQuantity === undefined
    ? null
    : {
        quantity: new Prisma.Decimal(initialQuantity),
        reservedQuantity: new Prisma.Decimal(initialReservedQuantity),
        supplierId: initialSupplierId,
      };
  const writes: {
    create?: { supplierId: string | null; status: "Received" | "Pending" | "Ordered" };
    update?: object;
  }[] = [];
  const updateFilters: {
    productId: string;
    warehouseId: string;
    status: string;
  }[] = [];
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
      findUnique: async () => stock && {
        quantity: stock.quantity,
        reservedQuantity: stock.reservedQuantity,
      },
      updateMany: async (input: {
        where: {
          productId: string;
          warehouseId: string;
          status: string;
          quantity?: { equals?: Prisma.Decimal; gte?: Prisma.Decimal; lte?: Prisma.Decimal };
          reservedQuantity?: { equals?: Prisma.Decimal; gte?: Prisma.Decimal };
        };
        data: {
          quantity?: { increment?: Prisma.Decimal; decrement?: Prisma.Decimal };
          reservedQuantity?: { increment?: Prisma.Decimal; decrement?: Prisma.Decimal };
        };
      }) => {
        updateFilters.push({
          productId: input.where.productId,
          warehouseId: input.where.warehouseId,
          status: input.where.status,
        });
        if (!stock) return { count: 0 };
        if (input.where.quantity?.equals && !stock.quantity.equals(input.where.quantity.equals)) {
          return { count: 0 };
        }
        if (input.where.quantity?.gte && stock.quantity.lessThan(input.where.quantity.gte)) {
          return { count: 0 };
        }
        if (input.where.quantity?.lte && stock.quantity.greaterThan(input.where.quantity.lte)) {
          return { count: 0 };
        }
        if (
          input.where.reservedQuantity?.equals
          && !stock.reservedQuantity.equals(input.where.reservedQuantity.equals)
        ) return { count: 0 };
        if (
          input.where.reservedQuantity?.gte
          && stock.reservedQuantity.lessThan(input.where.reservedQuantity.gte)
        ) return { count: 0 };
        writes.push({ update: input.data });
        const quantity = input.data.quantity?.increment
          ? stock.quantity.plus(input.data.quantity.increment)
          : input.data.quantity?.decrement
            ? stock.quantity.minus(input.data.quantity.decrement)
            : stock.quantity;
        const reservedQuantity = input.data.reservedQuantity?.increment
          ? stock.reservedQuantity.plus(input.data.reservedQuantity.increment)
          : input.data.reservedQuantity?.decrement
            ? stock.reservedQuantity.minus(input.data.reservedQuantity.decrement)
            : stock.reservedQuantity;
        stock = {
          quantity,
          reservedQuantity,
          supplierId: stock.supplierId,
        };
        return { count: 1 };
      },
      create: async (input: {
        data: {
          quantity: Prisma.Decimal;
          supplierId: string | null;
          status: "Received" | "Pending" | "Ordered";
        };
      }) => {
        writes.push({ create: { supplierId: input.data.supplierId, status: input.data.status } });
        stock = {
          quantity: input.data.quantity,
          reservedQuantity: new Prisma.Decimal(0),
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
    reservedQuantity: () => stock?.reservedQuantity.toString() ?? null,
    supplierId: () => stock?.supplierId ?? null,
    writes,
    updateFilters,
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
  assert.deepEqual(fake.updateFilters, [{
    productId: "product-1",
    warehouseId: "warehouse-1",
    status: "Received",
  }]);
  assert.equal(fake.movementWrites.length, 1);
  assert.equal(fake.movementWrites[0].data.quantity.toString(), "-2.025");
});

test("sale stock adjustments fetch balances once and batch their movement records", async () => {
  const balances = new Map([
    ["product-1", {
      quantity: new Prisma.Decimal("8"),
      reservedQuantity: new Prisma.Decimal("1"),
    }],
    ["product-2", {
      quantity: new Prisma.Decimal("5"),
      reservedQuantity: new Prisma.Decimal("0"),
    }],
  ]);
  const updatedProducts: string[] = [];
  let balanceReads = 0;
  let movementBatch: { productId: string; quantity: Prisma.Decimal }[] = [];
  const transaction = {
    productStock: {
      findMany: async () => {
        balanceReads += 1;
        return [...balances].map(([productId, balance]) => ({ productId, ...balance }));
      },
      updateMany: async (input: {
        where: {
          productId: string;
          quantity?: { equals?: Prisma.Decimal };
          reservedQuantity?: { equals?: Prisma.Decimal };
        };
        data: { quantity?: { decrement?: Prisma.Decimal } };
      }) => {
        const stock = balances.get(input.where.productId);
        const decrement = input.data.quantity?.decrement;
        if (
          !stock
          || !decrement
          || !stock.quantity.equals(input.where.quantity?.equals ?? -1)
          || !stock.reservedQuantity.equals(input.where.reservedQuantity?.equals ?? -1)
        ) return { count: 0 };
        balances.set(input.where.productId, {
          quantity: stock.quantity.minus(decrement),
          reservedQuantity: stock.reservedQuantity,
        });
        updatedProducts.push(input.where.productId);
        return { count: 1 };
      },
    },
    stockMovement: {
      createMany: async (input: {
        data: { productId: string; quantity: Prisma.Decimal }[];
      }) => {
        movementBatch = input.data;
      },
    },
  } as unknown as Prisma.TransactionClient;

  await applySaleStockAdjustments(transaction, [
    {
      productId: "product-1",
      productName: "Widget",
      warehouseId: "warehouse-1",
      quantity: "2",
      movement,
    },
    {
      productId: "product-2",
      productName: "Gadget",
      warehouseId: "warehouse-1",
      quantity: "1.25",
      movement,
    },
  ]);

  assert.equal(balanceReads, 1);
  assert.deepEqual(updatedProducts, ["product-1", "product-2"]);
  assert.equal(balances.get("product-1")?.quantity.toString(), "6");
  assert.equal(balances.get("product-2")?.quantity.toString(), "3.75");
  assert.deepEqual(
    movementBatch.map(({ productId, quantity }) => [productId, quantity.toString()]),
    [["product-1", "-2"], ["product-2", "-1.25"]],
  );
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

test("stock subtraction cannot consume quantities reserved by pending sales", async () => {
  const fake = createTransaction("5", null, "4");

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
  assert.equal(fake.quantity(), "5");
  assert.equal(fake.reservedQuantity(), "4");
});

test("reserves available stock without changing physical on-hand quantity", async () => {
  const fake = createTransaction("5");

  await reserveStock(fake.transaction, {
    productId: "product-1",
    productName: "Widget",
    warehouseId: "warehouse-1",
    quantity: "3.25",
    type: "Addition",
  });

  assert.equal(fake.quantity(), "5");
  assert.equal(fake.reservedQuantity(), "3.25");
});

test("tracks pending purchase quantities in their own stock bucket", async () => {
  const fake = createTransaction();

  await applyStockBucketAdjustment(fake.transaction, {
    productId: "product-1",
    warehouseId: "warehouse-1",
    status: "Pending",
    quantity: "8",
    type: "Addition",
  });

  assert.equal(fake.quantity(), "8");
  assert.equal(fake.movementWrites.length, 0);
  assert.equal(fake.writes[0].create?.status, "Pending");
});
