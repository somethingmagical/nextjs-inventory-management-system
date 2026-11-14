import "dotenv/config";

import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../lib/db";
import { PERMISSIONS } from "../lib/permissions";

const adminSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  firstName: z.string().trim().min(1).default("Admin"),
  lastName: z.string().trim().min(1).default("User"),
  phoneNumber: z.string().trim().optional(),
  image: z.string().trim().url().optional(),
});

const DEMO_WAREHOUSES = [
  {
    id: "demo-warehouse-central",
    name: "Central Warehouse",
    email: "central@demo.inventory.local",
    phoneNumber: "555-0101",
    country: "New Zealand",
    countryCode: "NZ",
    city: "Auckland",
    address: "100 Market Street",
  },
  {
    id: "demo-warehouse-west",
    name: "Westside Store",
    email: "westside@demo.inventory.local",
    phoneNumber: "555-0102",
    country: "New Zealand",
    countryCode: "NZ",
    city: "Auckland",
    address: "25 Harbour Road",
  },
] as const;

const DEMO_SUPPLIERS = [
  "Pacific Wholesale",
  "Harbour Goods Ltd",
  "Summit Supply Co",
  "Everyday Distribution",
] as const;

const DEMO_CUSTOMERS = [
  "Alex Morgan",
  "Taylor Chen",
  "Jordan Patel",
  "Casey Williams",
  "Riley Thompson",
  "Avery Smith",
  "Jamie Wilson",
  "Drew Anderson",
] as const;

const DEMO_CATEGORIES = [
  "Beverages",
  "Pantry",
  "Household",
  "Personal Care",
  "Office Supplies",
] as const;

const DEMO_BRANDS = [
  "Northstar",
  "Harbour & Pine",
  "Fieldstone",
  "Brightline",
  "Cedar & Co",
] as const;

const DEMO_UNITS = ["piece", "bottle", "bag", "box", "kilogram"] as const;
const DEMO_PRODUCT_NAMES = [
  ["Sparkling Water", "Ground Coffee", "Green Tea", "Orange Juice"],
  ["Jasmine Rice", "Rolled Oats", "Pasta", "Olive Oil"],
  ["Dish Soap", "Laundry Powder", "Paper Towels", "Storage Container"],
  ["Hand Soap", "Shampoo", "Toothpaste", "Skin Lotion"],
  ["Notebook", "Ballpoint Pens", "Printer Paper", "Desk Organizer"],
] as const;

type DemoStockMovement = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  type:
    | "ProductInitialization"
    | "PurchaseReceipt"
    | "Sale"
    | "PurchaseReturn"
    | "SaleReturn"
    | "Transfer";
  sourceType:
    | "Product"
    | "Purchase"
    | "Sale"
    | "PurchaseReturn"
    | "SaleReturn"
    | "Transfer";
  sourceId: string;
  createdAt: Date;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function demoDate(daysAfterStart: number) {
  const date = new Date("2026-10-01T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + daysAfterStart);
  return date;
}

async function seedDemoData() {
  await db.$transaction(
    async (transaction) => {
      for (const warehouse of DEMO_WAREHOUSES) {
        await transaction.warehouse.upsert({
          where: { id: warehouse.id },
          create: warehouse,
          update: warehouse,
        });
      }

      for (const [index, name] of DEMO_SUPPLIERS.entries()) {
        const id = `demo-supplier-${index + 1}`;
        const supplier = {
          id,
          name,
          email: `supplier-${index + 1}@demo.inventory.local`,
          phoneNumber: `555-02${String(index + 1).padStart(2, "0")}`,
          country: "New Zealand",
          countryCode: "NZ",
          city: "Auckland",
          address: `${10 + index} Supply Lane`,
        };
        await transaction.supplier.upsert({
          where: { id },
          create: supplier,
          update: supplier,
        });
      }

      for (const [index, name] of DEMO_CUSTOMERS.entries()) {
        const id = `demo-customer-${index + 1}`;
        const customer = {
          id,
          name,
          email: `customer-${index + 1}@demo.inventory.local`,
          phoneNumber: `555-03${String(index + 1).padStart(2, "0")}`,
          country: "New Zealand",
          countryCode: "NZ",
          city: "Auckland",
          address: `${20 + index} Sample Street`,
        };
        await transaction.customer.upsert({
          where: { id },
          create: customer,
          update: customer,
        });
      }

      for (const [index, name] of DEMO_CATEGORIES.entries()) {
        const id = `demo-category-${index + 1}`;
        await transaction.category.upsert({
          where: { id },
          create: { id, name },
          update: { name, deletedAt: null },
        });
      }

      for (const [index, name] of DEMO_BRANDS.entries()) {
        const id = `demo-brand-${index + 1}`;
        await transaction.brand.upsert({
          where: { id },
          create: { id, name },
          update: { name, deletedAt: null },
        });
      }

      for (const name of DEMO_UNITS) {
        await transaction.unit.upsert({
          where: { name },
          create: { name },
          update: { deletedAt: null },
        });
      }

      const products = DEMO_PRODUCT_NAMES.flatMap((names, categoryIndex) =>
        names.map((name, productIndex) => {
          const index = categoryIndex * names.length + productIndex;
          const purchasePrice = roundMoney(4.5 + index * 1.35);
          const sellingPrice = roundMoney(purchasePrice * 1.55);
          return {
            id: `demo-product-${String(index + 1).padStart(2, "0")}`,
            code: `DEMO-${String(index + 1).padStart(3, "0")}`,
            name,
            price: sellingPrice,
            categoryId: `demo-category-${categoryIndex + 1}`,
            brandId: `demo-brand-${(index % DEMO_BRANDS.length) + 1}`,
            productUnit: DEMO_UNITS[productIndex % DEMO_UNITS.length],
            stockAlert: 5,
            orderTax: 0,
            taxType: "Exclusive" as const,
            category: DEMO_CATEGORIES[categoryIndex],
            brand: DEMO_BRANDS[index % DEMO_BRANDS.length],
            unit: DEMO_UNITS[productIndex % DEMO_UNITS.length],
            purchasePrice,
            sellingPrice,
            alertQuantity: 5,
          };
        }),
      );

      for (const product of products) {
        await transaction.product.upsert({
          where: { id: product.id },
          create: product,
          update: { ...product, deletedAt: null },
        });
      }

      const movements: DemoStockMovement[] = [];
      const balances = new Map<string, number>();
      const addMovement = (
        movement: Omit<DemoStockMovement, "id"> & { id: string },
      ) => {
        movements.push(movement);
        const key = `${movement.productId}:${movement.warehouseId}`;
        balances.set(key, (balances.get(key) ?? 0) + movement.quantity);
      };

      for (const product of products) {
        for (const warehouse of DEMO_WAREHOUSES) {
          addMovement({
            id: `demo-opening-${product.id}-${warehouse.id}`,
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: 50,
            type: "ProductInitialization",
            sourceType: "Product",
            sourceId: product.id,
            createdAt: demoDate(0),
          });
        }
      }

      const purchaseDefinitions = Array.from({ length: 8 }, (_, index) => {
        const id = `demo-purchase-${index + 1}`;
        const status =
          index < 5 ? ("Received" as const) : index < 7 ? ("Ordered" as const) : ("Pending" as const);
        const lineDefinitions = [index * 2, index * 2 + 1].map(
          (productIndex, lineIndex) => {
            const product = products[productIndex];
            const quantity = lineIndex === 0 ? 5 + index : 2 + (index % 3);
            return {
              id: `demo-purchase-item-${index + 1}-${lineIndex + 1}`,
              product,
              quantity,
              unitCost: product.purchasePrice,
              subtotal: roundMoney(quantity * product.purchasePrice),
            };
          },
        );
        const grandTotal = roundMoney(
          lineDefinitions.reduce((total, item) => total + item.subtotal, 0),
        );
        return {
          id,
          reference: `DEMO-PUR-${String(index + 1).padStart(3, "0")}`,
          supplierId: `demo-supplier-${(index % DEMO_SUPPLIERS.length) + 1}`,
          warehouseId: DEMO_WAREHOUSES[index % DEMO_WAREHOUSES.length].id,
          date: demoDate(index),
          status,
          deliveryStatus:
            status === "Received"
              ? ("Delivered" as const)
              : status === "Ordered"
                ? ("InTransit" as const)
                : ("Pending" as const),
          grandTotal,
          lines: lineDefinitions,
        };
      });

      for (const [index, purchase] of purchaseDefinitions.entries()) {
        const { lines, ...purchaseData } = purchase;
        await transaction.purchase.upsert({
          where: { id: purchase.id },
          create: purchaseData,
          update: purchaseData,
        });
        for (const [lineIndex, line] of lines.entries()) {
          const item = {
            id: line.id,
            purchaseId: purchase.id,
            productId: line.product.id,
            netUnitCost: line.unitCost,
            quantity: line.quantity,
            unit: line.product.productUnit,
            discountType: "Fixed" as const,
            discount: 0,
            taxType: "Exclusive" as const,
            orderTax: 0,
            subtotal: line.subtotal,
          };
          await transaction.purchaseItem.upsert({
            where: { id: item.id },
            create: item,
            update: item,
          });
          if (purchase.status === "Received") {
            addMovement({
              id: `demo-purchase-movement-${index + 1}-${lineIndex + 1}`,
              productId: line.product.id,
              warehouseId: purchase.warehouseId,
              quantity: line.quantity,
              type: "PurchaseReceipt",
              sourceType: "Purchase",
              sourceId: purchase.id,
              createdAt: purchase.date,
            });
          }
        }
      }

      const saleDefinitions = Array.from({ length: 12 }, (_, index) => {
        const id = `demo-sale-${index + 1}`;
        const lines = [0, 1].map((lineIndex) => {
          const productIndex = (index * 2 + lineIndex) % products.length;
          const product = products[productIndex];
          const quantity = 1 + ((index + lineIndex) % 3);
          return {
            id: `demo-sale-item-${index + 1}-${lineIndex + 1}`,
            product,
            quantity,
            subtotal: roundMoney(quantity * product.sellingPrice),
          };
        });
        const grandTotal = roundMoney(
          lines.reduce((total, item) => total + item.subtotal, 0),
        );
        const paymentStatus =
          index < 4 ? ("Paid" as const) : index < 8 ? ("Partial" as const) : ("Unpaid" as const);
        const paid =
          paymentStatus === "Paid"
            ? grandTotal
            : paymentStatus === "Partial"
              ? roundMoney(grandTotal / 2)
              : 0;
        return {
          id,
          reference: `DEMO-SAL-${String(index + 1).padStart(3, "0")}`,
          customerId: `demo-customer-${(index % DEMO_CUSTOMERS.length) + 1}`,
          warehouseId: DEMO_WAREHOUSES[index % DEMO_WAREHOUSES.length].id,
          date: demoDate(index + 10),
          grandTotal,
          paid,
          due: roundMoney(grandTotal - paid),
          paymentStatus,
          lines,
        };
      });

      for (const [index, sale] of saleDefinitions.entries()) {
        const { lines, ...saleData } = sale;
        const saleRecord = {
          ...saleData,
          status: "Received" as const,
          orderTax: 0,
          discount: 0,
          shipping: 0,
          paymentType: index % 2 === 0 ? "Cash" : "Card",
          notes: "Seeded demo sale",
        };
        await transaction.sale.upsert({
          where: { id: sale.id },
          create: saleRecord,
          update: saleRecord,
        });
        for (const [lineIndex, line] of lines.entries()) {
          const item = {
            id: line.id,
            saleId: sale.id,
            productId: line.product.id,
            netUnitPrice: line.product.sellingPrice,
            quantity: line.quantity,
            unit: line.product.productUnit,
            discountType: "Fixed" as const,
            discount: 0,
            taxType: "Exclusive" as const,
            orderTax: 0,
            subtotal: line.subtotal,
          };
          await transaction.saleItem.upsert({
            where: { id: item.id },
            create: item,
            update: item,
          });
          addMovement({
            id: `demo-sale-movement-${index + 1}-${lineIndex + 1}`,
            productId: line.product.id,
            warehouseId: sale.warehouseId,
            quantity: -line.quantity,
            type: "Sale",
            sourceType: "Sale",
            sourceId: sale.id,
            createdAt: sale.date,
          });
        }
        if (sale.paymentStatus !== "Unpaid") {
          const payment = {
            id: `demo-sale-payment-${index + 1}`,
            saleId: sale.id,
            amount: sale.paid,
            paymentType: saleRecord.paymentType,
            date: sale.date,
            notes: "Seeded demo payment",
          };
          await transaction.salePayment.upsert({
            where: { id: payment.id },
            create: payment,
            update: payment,
          });
        }
      }

      const purchaseReturnId = "demo-purchase-return-1";
      const purchaseToReturn = purchaseDefinitions[0];
      const purchaseReturnLines = purchaseToReturn.lines.map((line, index) => ({
        id: `demo-purchase-return-item-${index + 1}`,
        productId: line.product.id,
        quantity: 1,
        unit: line.product.productUnit,
        netUnitCost: line.unitCost,
        subtotal: line.unitCost,
      }));
      const purchaseReturnTotal = roundMoney(
        purchaseReturnLines.reduce((total, item) => total + item.subtotal, 0),
      );
      const purchaseReturn = {
        id: purchaseReturnId,
        reference: "DEMO-PR-001",
        supplierId: purchaseToReturn.supplierId,
        warehouseId: purchaseToReturn.warehouseId,
        date: demoDate(22),
        status: "Received" as const,
        grandTotal: purchaseReturnTotal,
        paid: 0,
        due: purchaseReturnTotal,
        paymentType: "Cash",
        notes: "Seeded demo purchase return",
      };
      await transaction.purchaseReturn.upsert({
        where: { id: purchaseReturn.id },
        create: purchaseReturn,
        update: purchaseReturn,
      });
      for (const [index, line] of purchaseReturnLines.entries()) {
        const item = {
          ...line,
          returnId: purchaseReturn.id,
          discountType: "Fixed" as const,
          discount: 0,
          taxType: "Exclusive" as const,
          orderTax: 0,
        };
        await transaction.purchaseReturnItem.upsert({
          where: { id: line.id },
          create: item,
          update: item,
        });
        addMovement({
          id: `demo-purchase-return-movement-${index + 1}`,
          productId: line.productId,
          warehouseId: purchaseReturn.warehouseId,
          quantity: -line.quantity,
          type: "PurchaseReturn",
          sourceType: "PurchaseReturn",
          sourceId: purchaseReturn.id,
          createdAt: purchaseReturn.date,
        });
      }

      const saleReturnId = "demo-sale-return-1";
      const saleToReturn = saleDefinitions[0];
      const saleReturnLines = saleToReturn.lines.map((line, index) => ({
        id: `demo-sale-return-item-${index + 1}`,
        productId: line.product.id,
        quantity: 1,
        unit: line.product.productUnit,
        netUnitPrice: line.product.sellingPrice,
        subtotal: line.product.sellingPrice,
      }));
      const saleReturnTotal = roundMoney(
        saleReturnLines.reduce((total, item) => total + item.subtotal, 0),
      );
      const saleReturn = {
        id: saleReturnId,
        reference: "DEMO-SR-001",
        customerId: saleToReturn.customerId,
        warehouseId: saleToReturn.warehouseId,
        saleId: saleToReturn.id,
        date: demoDate(23),
        status: "Received" as const,
        grandTotal: saleReturnTotal,
        paid: 0,
        due: saleReturnTotal,
        paymentStatus: "Unpaid" as const,
        notes: "Seeded demo sale return",
      };
      await transaction.saleReturn.upsert({
        where: { id: saleReturn.id },
        create: saleReturn,
        update: saleReturn,
      });
      for (const [index, line] of saleReturnLines.entries()) {
        const item = {
          ...line,
          returnId: saleReturn.id,
          discountType: "Fixed" as const,
          discount: 0,
          taxType: "Exclusive" as const,
          orderTax: 0,
        };
        await transaction.saleReturnItem.upsert({
          where: { id: line.id },
          create: item,
          update: item,
        });
        addMovement({
          id: `demo-sale-return-movement-${index + 1}`,
          productId: line.productId,
          warehouseId: saleReturn.warehouseId,
          quantity: line.quantity,
          type: "SaleReturn",
          sourceType: "SaleReturn",
          sourceId: saleReturn.id,
          createdAt: saleReturn.date,
        });
      }

      const transferId = "demo-transfer-1";
      const transferLines = [7, 11].map((productIndex, index) => {
        const product = products[productIndex];
        const quantity = 2;
        return {
          id: `demo-transfer-item-${index + 1}`,
          product,
          quantity,
          subtotal: roundMoney(quantity * product.purchasePrice),
        };
      });
      const transferTotal = roundMoney(
        transferLines.reduce((total, item) => total + item.subtotal, 0),
      );
      const transfer = {
        id: transferId,
        reference: "DEMO-TR-001",
        fromWarehouseId: DEMO_WAREHOUSES[0].id,
        toWarehouseId: DEMO_WAREHOUSES[1].id,
        date: demoDate(24),
        status: "Completed" as const,
        grandTotal: transferTotal,
        notes: "Seeded demo warehouse transfer",
      };
      await transaction.transfer.upsert({
        where: { id: transfer.id },
        create: transfer,
        update: transfer,
      });
      for (const [index, line] of transferLines.entries()) {
        const item = {
          id: line.id,
          transferId: transfer.id,
          productId: line.product.id,
          netUnitCost: line.product.purchasePrice,
          quantity: line.quantity,
          discountType: "Fixed" as const,
          discount: 0,
          taxType: "Exclusive" as const,
          orderTax: 0,
          subtotal: line.subtotal,
        };
        await transaction.transferItem.upsert({
          where: { id: item.id },
          create: item,
          update: item,
        });
        addMovement({
          id: `demo-transfer-out-movement-${index + 1}`,
          productId: line.product.id,
          warehouseId: transfer.fromWarehouseId,
          quantity: -line.quantity,
          type: "Transfer",
          sourceType: "Transfer",
          sourceId: transfer.id,
          createdAt: transfer.date,
        });
        addMovement({
          id: `demo-transfer-in-movement-${index + 1}`,
          productId: line.product.id,
          warehouseId: transfer.toWarehouseId,
          quantity: line.quantity,
          type: "Transfer",
          sourceType: "Transfer",
          sourceId: transfer.id,
          createdAt: transfer.date,
        });
      }

      const expenseCategoryNames = [
        "Utilities",
        "Delivery",
        "Packaging",
        "Maintenance",
      ] as const;
      for (const [index, name] of expenseCategoryNames.entries()) {
        const id = `demo-expense-category-${index + 1}`;
        await transaction.expenseCategory.upsert({
          where: { id },
          create: { id, name },
          update: { name, deletedAt: null },
        });
      }

      for (let index = 0; index < 4; index += 1) {
        const expense = {
          id: `demo-expense-${index + 1}`,
          reference: `DEMO-EXP-${String(index + 1).padStart(3, "0")}`,
          date: demoDate(index + 20),
          title: expenseCategoryNames[index],
          warehouseId: DEMO_WAREHOUSES[index % DEMO_WAREHOUSES.length].id,
          expenseCategoryId: `demo-expense-category-${index + 1}`,
          amount: roundMoney(75 + index * 42.5),
          details: "Seeded demo expense",
        };
        await transaction.expense.upsert({
          where: { id: expense.id },
          create: expense,
          update: expense,
        });
      }

      for (const movement of movements) {
        await transaction.stockMovement.upsert({
          where: { id: movement.id },
          create: movement,
          update: movement,
        });
      }

      for (const product of products) {
        for (const warehouse of DEMO_WAREHOUSES) {
          const key = `${product.id}:${warehouse.id}`;
          const stock = {
            productId: product.id,
            warehouseId: warehouse.id,
            supplierId: null,
            quantity: new Prisma.Decimal(balances.get(key) ?? 0),
            status: "Received" as const,
          };
          await transaction.productStock.upsert({
            where: {
              productId_warehouseId: {
                productId: product.id,
                warehouseId: warehouse.id,
              },
            },
            create: stock,
            update: stock,
          });
        }
      }
    },
    { maxWait: 10_000, timeout: 300_000 },
  );

  console.info("Standard demo preset ensured: 256 demo records.");
}

async function seedDirectCustomer() {
  await db.customer.upsert({
    where: { id: "direct-customer" },
    update: {
      name: "direct-customer",
      deletedAt: null,
    },
    create: {
      id: "direct-customer",
      name: "direct-customer",
      email: "direct-customer@inventory.local",
      phoneNumber: "N/A",
      country: "N/A",
      city: "N/A",
      address: "POS walk-in customer",
    },
  });

  console.info("Default direct customer ensured.");
}

async function seedAdmin() {
  const parsed = adminSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    firstName: process.env.ADMIN_FIRST_NAME || undefined,
    lastName: process.env.ADMIN_LAST_NAME || undefined,
    phoneNumber: process.env.ADMIN_PHONE_NUMBER || undefined,
    image: process.env.ADMIN_IMAGE || undefined,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid admin seed configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  const adminRole = await db.role.upsert({
    where: { name: "admin" },
    update: { deletedAt: null },
    create: { name: "admin" },
    select: { id: true },
  });
  await db.rolePermission.createMany({
    data: PERMISSIONS.map((permission) => ({ roleId: adminRole.id, permission })),
    skipDuplicates: true,
  });

  const password = await hash(parsed.data.password, 12);
  const admin = await db.user.upsert({
    where: { email: parsed.data.email },
    update: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      password,
      phoneNumber: parsed.data.phoneNumber ?? null,
      image: parsed.data.image ?? null,
      role: "admin",
      roleId: adminRole.id,
    },
    create: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      password,
      phoneNumber: parsed.data.phoneNumber ?? null,
      image: parsed.data.image ?? null,
      role: "admin",
      roleId: adminRole.id,
    },
    select: { email: true },
  });

  console.info(`Admin user seeded: ${admin.email}`);
}

seedDirectCustomer()
  .then(seedAdmin)
  .then(() =>
    process.env.SEED_DEMO_DATA === "true" ? seedDemoData() : undefined,
  )
  .catch((error: unknown) => {
    console.error("Failed to seed database.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
