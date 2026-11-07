"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  applyStockAdjustment,
  InsufficientStockError,
  StockQuantityLimitError,
} from "@/lib/product-stock";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import {
  calculatePurchaseReturnDeleteStockDeltas,
  calculatePurchaseReturnStockDeltas,
} from "@/lib/purchase-return-stock";
import { getPurchaseReturnAccess } from "./authorization";
import {
  purchaseReturnCreateSchema,
  purchaseReturnIdSchema,
} from "./purchase-return-create-schema";
import type { PurchaseReturnCreateActionState } from "./create/action-state";

const purchaseReturnProductSearchSchema = z.object({
  warehouseId: z.string().trim().min(1, "Select a warehouse to search products."),
  query: z.string().trim().min(2).max(120),
});

export type PurchaseReturnProductSearchResult =
  | {
      status: "success";
      products: {
        id: string;
        code: string;
        name: string;
        netUnitCost: string;
        unit: string;
        stock: string;
      }[];
    }
  | { status: "error"; message: string };

export async function savePurchaseReturn(
  _previousState: PurchaseReturnCreateActionState,
  formData: FormData,
): Promise<PurchaseReturnCreateActionState> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before saving a purchase return." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const rawReturnId = formData.get("returnId");
  let returnId: string | undefined;
  if (rawReturnId !== null) {
    const parsedId = purchaseReturnIdSchema.safeParse(rawReturnId);
    if (!parsedId.success) {
      return { status: "error", message: "This purchase return could not be found." };
    }
    returnId = parsedId.data;
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return {
      status: "error",
      message: "Purchase return items are invalid. Review the products and try again.",
    };
  }

  const parsed = purchaseReturnCreateSchema.safeParse({
    warehouseId: formData.get("warehouseId"),
    supplierId: formData.get("supplierId"),
    date: formData.get("date"),
    status: formData.get("status"),
    orderTax: formData.get("orderTax"),
    discount: formData.get("discount"),
    shipping: formData.get("shipping"),
    notes: formData.get("notes") || null,
    items,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter valid purchase return details.",
    };
  }

  const lineTotals: ReturnType<typeof calculatePurchaseLineTotals>[] = [];
  try {
    for (const item of parsed.data.items) {
      lineTotals.push(calculatePurchaseLineTotals({
        unitCost: item.netUnitCost,
        quantity: item.quantity,
        discountType: item.discountType,
        discount: item.discount,
        taxType: item.taxType,
        taxRate: item.orderTax,
      }));
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid purchase return line details.",
    };
  }

  let totals: ReturnType<typeof calculatePurchaseTotals>;
  try {
    totals = calculatePurchaseTotals({
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      orderTaxRate: parsed.data.orderTax,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid purchase return totals.",
    };
  }

  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Purchase return totals exceed the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const [warehouse, supplier, products, existingReturn] = await Promise.all([
        transaction.warehouse.findFirst({
          where: { id: parsed.data.warehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.supplier.findFirst({
          where: { id: parsed.data.supplierId, deletedAt: null },
          select: { id: true },
        }),
        transaction.product.findMany({
          where: {
            id: { in: parsed.data.items.map((item) => item.productId) },
            deletedAt: null,
          },
          select: { id: true, name: true, productUnit: true },
        }),
        returnId
          ? transaction.purchaseReturn.findFirst({
              where: { id: returnId, deletedAt: null },
              select: {
                id: true,
                warehouseId: true,
                status: true,
                paid: true,
                items: {
                  select: {
                    productId: true,
                    quantity: true,
                    product: { select: { name: true } },
                  },
                },
              },
            })
          : Promise.resolve(null),
      ]);

      if (!warehouse) throw new Error("The selected warehouse is no longer available.");
      if (!supplier) throw new Error("The selected supplier is no longer available.");
      if (returnId && !existingReturn) {
        throw new Error("This purchase return no longer exists or has already been deleted.");
      }
      if (products.length !== parsed.data.items.length) {
        throw new Error("One or more selected products are no longer available.");
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      const customUnits = [...new Set(parsed.data.items
        .filter((item) => productById.get(item.productId)?.productUnit !== item.unit)
        .map((item) => item.unit))];
      if (customUnits.length > 0) {
        const activeUnits = await transaction.unit.findMany({
          where: { name: { in: customUnits }, deletedAt: null },
          select: { name: true },
        });
        const activeUnitNames = new Set(activeUnits.map((unit) => unit.name));
        if (customUnits.some((unit) => !activeUnitNames.has(unit))) {
          throw new Error("One or more selected purchase return units are no longer available.");
        }
      }

      const itemData = parsed.data.items.map((item, index) => ({
        productId: item.productId,
        netUnitCost: new Prisma.Decimal(item.netUnitCost),
        quantity: new Prisma.Decimal(item.quantity),
        unit: item.unit,
        discountType: item.discountType,
        discount: new Prisma.Decimal(item.discount),
        taxType: item.taxType,
        orderTax: new Prisma.Decimal(item.orderTax),
        subtotal: lineTotals[index].subtotal,
      }));

      if (existingReturn) {
        if (existingReturn.paid.greaterThan(totals.grandTotal)) {
          throw new Error("The new grand total cannot be less than the amount already paid.");
        }

        const stockDeltas = calculatePurchaseReturnStockDeltas(
          {
            warehouseId: existingReturn.warehouseId,
            status: existingReturn.status,
            items: existingReturn.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
          {
            warehouseId: warehouse.id,
            status: parsed.data.status,
            items: parsed.data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        );
        const previousProductNames = new Map(
          existingReturn.items.map((item) => [item.productId, item.product.name]),
        );

        // Net the old and new received quantities so edits apply only the stock difference.
        for (const delta of stockDeltas) {
          const product = productById.get(delta.productId);
          await applyStockAdjustment(transaction, {
            productId: delta.productId,
            productName: product?.name ?? previousProductNames.get(delta.productId) ?? "product",
            warehouseId: delta.warehouseId,
            quantity: delta.quantity.toString(),
            type: delta.type,
            documentLabel: "purchase return edit",
          });
        }

        await transaction.purchaseReturn.update({
          where: { id: existingReturn.id },
          data: {
            warehouseId: warehouse.id,
            supplierId: supplier.id,
            date: new Date(`${parsed.data.date}T00:00:00.000Z`),
            status: parsed.data.status,
            orderTax: new Prisma.Decimal(parsed.data.orderTax),
            discount: totals.discount,
            shipping: totals.shipping,
            grandTotal: totals.grandTotal,
            due: totals.grandTotal.minus(existingReturn.paid),
            notes: parsed.data.notes,
            items: {
              deleteMany: {},
              create: itemData,
            },
          },
        });
        return;
      }

      const reference = `PR_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      await transaction.purchaseReturn.create({
        data: {
          reference,
          warehouseId: warehouse.id,
          supplierId: supplier.id,
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          status: parsed.data.status,
          orderTax: new Prisma.Decimal(parsed.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          paid: new Prisma.Decimal(0),
          due: totals.grandTotal,
          paymentType: "Cash",
          notes: parsed.data.notes,
          items: { create: itemData },
        },
        select: { id: true },
      });

      if (parsed.data.status === "Received") {
        for (const item of parsed.data.items) {
          const product = productById.get(item.productId);
          if (!product) throw new Error("One or more selected products are no longer available.");
          await applyStockAdjustment(transaction, {
            productId: product.id,
            productName: product.name,
            warehouseId: warehouse.id,
            quantity: item.quantity,
            type: "Subtraction",
            documentLabel: "purchase return",
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && [
      "The selected warehouse is no longer available.",
      "The selected supplier is no longer available.",
      "One or more selected products are no longer available.",
      "One or more selected purchase return units are no longer available.",
      "This purchase return no longer exists or has already been deleted.",
      "The new grand total cannot be less than the amount already paid.",
    ].includes(error.message)) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        status: "error",
        message: "Inventory changed while saving. Refresh the page and try again.",
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "The purchase return reference conflicted. Please submit it again.",
      };
    }
    throw error;
  }

  revalidatePath("/purchases/returns");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  revalidatePath("/purchases/returns/[id]", "page");
  if (returnId) redirect("/purchases/returns?updated=1");
  redirect("/purchases/returns?created=1");
}

export async function fetchPurchaseReturnProductStocks(
  warehouseId: string,
  productIds: string[],
): Promise<
  | { status: "success"; stocks: { productId: string; stock: string }[] }
  | { status: "error"; message: string }
> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before loading warehouse stock." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const parsed = z.object({
    warehouseId: z.string().trim().min(1).max(191),
    productIds: z.array(z.string().trim().min(1).max(191)).max(100),
  }).safeParse({ warehouseId, productIds });
  if (!parsed.success) {
    return { status: "error", message: "The warehouse stock request is invalid." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsed.data.warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }

  const stocks = await db.productStock.findMany({
    where: {
      warehouseId: warehouse.id,
      productId: { in: parsed.data.productIds },
    },
    select: { productId: true, quantity: true },
  });
  const stockByProductId = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));

  return {
    status: "success",
    stocks: parsed.data.productIds.map((productId) => ({
      productId,
      stock: stockByProductId.get(productId)?.toString() ?? "0",
    })),
  };
}

export async function deletePurchaseReturn(
  _previousState: PurchaseReturnCreateActionState,
  formData: FormData,
): Promise<PurchaseReturnCreateActionState> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a purchase return." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const parsedId = purchaseReturnIdSchema.safeParse(formData.get("returnId"));
  if (!parsedId.success) {
    return { status: "error", message: "This purchase return could not be found." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const purchaseReturn = await transaction.purchaseReturn.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: {
          id: true,
          warehouseId: true,
          status: true,
          items: {
            select: {
              quantity: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!purchaseReturn) {
        throw new Error("This purchase return no longer exists or has already been deleted.");
      }

      if (purchaseReturn.status === "Received") {
        const productNameById = new Map(
          purchaseReturn.items.map((item) => [item.product.id, item.product.name]),
        );
        const stockDeltas = calculatePurchaseReturnDeleteStockDeltas({
          warehouseId: purchaseReturn.warehouseId,
          status: purchaseReturn.status,
          items: purchaseReturn.items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        });
        for (const delta of stockDeltas) {
          const currentStock = await transaction.productStock.findUnique({
            where: {
              productId_warehouseId: {
                productId: delta.productId,
                warehouseId: purchaseReturn.warehouseId,
              },
            },
            select: { quantity: true },
          });
          const restoredQuantity = (currentStock?.quantity ?? new Prisma.Decimal(0))
            .plus(delta.quantity);
          if (restoredQuantity.greaterThan(new Prisma.Decimal("999999999.999"))) {
            throw new StockQuantityLimitError();
          }

          // Deleting a received return undoes its outbound movement, so restore the stock.
          await applyStockAdjustment(transaction, {
            productId: delta.productId,
            productName: productNameById.get(delta.productId) ?? "product",
            warehouseId: purchaseReturn.warehouseId,
            quantity: delta.quantity.toString(),
            type: delta.type,
            documentLabel: "purchase return deletion",
          });
        }
      }

      const deleted = await transaction.purchaseReturn.updateMany({
        where: { id: purchaseReturn.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (deleted.count !== 1) {
        throw new Error("This purchase return no longer exists or has already been deleted.");
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StockQuantityLimitError) {
      return {
        status: "error",
        message: "Restoring this return would exceed the supported stock quantity. No changes were made.",
      };
    }
    if (error instanceof Error && error.message === "This purchase return no longer exists or has already been deleted.") {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        status: "error",
        message: "Inventory changed while deleting. Refresh the page and try again.",
      };
    }
    throw error;
  }

  revalidatePath("/purchases/returns");
  revalidatePath("/purchases/returns/[id]", "page");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/purchases/returns?deleted=1");
}

export async function searchPurchaseReturnProducts(
  warehouseId: string,
  query: string,
): Promise<PurchaseReturnProductSearchResult> {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before searching products." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage purchase returns." };
  }

  const parsed = purchaseReturnProductSearchSchema.safeParse({ warehouseId, query });
  if (!parsed.success) {
    return { status: "error", message: "Choose a warehouse and enter at least 2 search characters." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsed.data.warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { code: { contains: parsed.data.query } },
        { name: { contains: parsed.data.query } },
      ],
      productStocks: {
        some: {
          warehouseId: warehouse.id,
          quantity: { gt: 0 },
        },
      },
    },
    orderBy: { name: "asc" },
    take: 10,
    select: {
      id: true,
      code: true,
      name: true,
      purchasePrice: true,
      productUnit: true,
      productStocks: {
        where: {
          warehouseId: warehouse.id,
          quantity: { gt: 0 },
        },
        select: { quantity: true },
      },
    },
  });

  return {
    status: "success",
    products: products.map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      netUnitCost: product.purchasePrice.toString(),
      unit: product.productUnit,
      stock: product.productStocks[0]?.quantity.toString() ?? "0",
    })),
  };
}
