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
  calculateTransferStockDeltas,
  calculateTransferDeleteStockDeltas,
  getTransferStockOperations,
  type TransferStockSnapshot,
} from "@/lib/transfer-stock";
import { getTransferAccess } from "../authorization";
import { transferCreateSchema, transferIdSchema } from "../transfer-create-schema";
import type { TransferCreateActionState } from "./action-state";

const transferProductSearchSchema = z.object({
  warehouseId: z.string().trim().min(1).max(191),
  query: z.string().trim().min(2).max(120),
});
const transferProductStocksSchema = z.object({
  warehouseId: z.string().trim().min(1).max(191),
  productIds: z.array(z.string().trim().min(1).max(191)).max(100),
  transferId: transferIdSchema.nullable(),
});

export type TransferProductSearchResult =
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

export type TransferProductStocksResult =
  | { status: "success"; stocks: { productId: string; stock: string }[] }
  | { status: "error"; message: string };

export async function createTransfer(
  _previousState: TransferCreateActionState,
  formData: FormData,
): Promise<TransferCreateActionState> {
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a transfer." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage transfers." };
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return { status: "error", message: "Transfer items are invalid. Review the products and try again." };
  }

  const parsed = transferCreateSchema.safeParse({
    fromWarehouseId: formData.get("fromWarehouseId"),
    toWarehouseId: formData.get("toWarehouseId"),
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
      message: parsed.error.issues[0]?.message ?? "Enter valid transfer details.",
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
      message: error instanceof Error ? error.message : "Enter valid transfer line details.",
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
      message: error instanceof Error ? error.message : "Enter valid transfer totals.",
    };
  }

  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.discount.greaterThan(maxStoredMoney)
    || totals.shipping.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Transfer totals exceed the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const [fromWarehouse, toWarehouse, products, sourceStocks] = await Promise.all([
        transaction.warehouse.findFirst({
          where: { id: parsed.data.fromWarehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.warehouse.findFirst({
          where: { id: parsed.data.toWarehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.product.findMany({
          where: {
            id: { in: parsed.data.items.map((item) => item.productId) },
            deletedAt: null,
          },
          select: { id: true, name: true },
        }),
        transaction.productStock.findMany({
          where: {
            warehouseId: parsed.data.fromWarehouseId,
            productId: { in: parsed.data.items.map((item) => item.productId) },
          },
          select: { productId: true, quantity: true },
        }),
      ]);

      if (!fromWarehouse) throw new Error("The selected source warehouse is no longer available.");
      if (!toWarehouse) throw new Error("The selected destination warehouse is no longer available.");
      if (fromWarehouse.id === toWarehouse.id) {
        throw new Error("Source and destination warehouses must be different.");
      }
      if (products.length !== parsed.data.items.length) {
        throw new Error("One or more selected products are no longer available.");
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      const stockByProductId = new Map(sourceStocks.map((stock) => [stock.productId, stock.quantity]));
      for (const item of parsed.data.items) {
        const sourceStock = stockByProductId.get(item.productId);
        const quantity = new Prisma.Decimal(item.quantity);
        if (!sourceStock || sourceStock.lessThan(quantity)) {
          throw new InsufficientStockError(
            productById.get(item.productId)?.name,
            "transfer",
          );
        }
      }

      const reference = `TR_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      await transaction.transfer.create({
        data: {
          reference,
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId: toWarehouse.id,
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          status: parsed.data.status,
          orderTax: new Prisma.Decimal(parsed.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          notes: parsed.data.notes,
          items: {
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId,
              netUnitCost: new Prisma.Decimal(item.netUnitCost),
              quantity: new Prisma.Decimal(item.quantity),
              discountType: item.discountType,
              discount: new Prisma.Decimal(item.discount),
              taxType: item.taxType,
              orderTax: new Prisma.Decimal(item.orderTax),
              subtotal: lineTotals[index].subtotal,
            })),
          },
        },
        select: { id: true },
      });

      for (const item of parsed.data.items) {
        for (const operation of getTransferStockOperations(parsed.data.status)) {
          const product = productById.get(item.productId);
          if (!product) throw new Error("One or more selected products are no longer available.");

          await applyStockAdjustment(transaction, {
            productId: item.productId,
            productName: product.name,
            warehouseId: operation.warehouse === "from" ? fromWarehouse.id : toWarehouse.id,
            quantity: item.quantity,
            type: operation.type,
            documentLabel: "transfer",
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError || error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && [
      "The selected source warehouse is no longer available.",
      "The selected destination warehouse is no longer available.",
      "Source and destination warehouses must be different.",
      "One or more selected products are no longer available.",
    ].includes(error.message)) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Inventory changed while saving. Refresh the page and try again." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", message: "The transfer reference conflicted. Please submit it again." };
    }
    throw error;
  }

  revalidatePath("/transfers");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/transfers?created=1");
}

export async function updateTransfer(
  transferId: string,
  _previousState: TransferCreateActionState,
  formData: FormData,
): Promise<TransferCreateActionState> {
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before editing a transfer." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage transfers." };
  }

  const parsedId = transferIdSchema.safeParse(transferId);
  if (!parsedId.success) {
    return { status: "error", message: "This transfer is invalid or no longer available." };
  }

  const parsedForm = parseTransferFormData(formData);
  if (!parsedForm.success) return parsedForm.error;

  const lineTotals: ReturnType<typeof calculatePurchaseLineTotals>[] = [];
  try {
    for (const item of parsedForm.data.items) {
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
      message: error instanceof Error ? error.message : "Enter valid transfer line details.",
    };
  }

  let totals: ReturnType<typeof calculatePurchaseTotals>;
  try {
    totals = calculatePurchaseTotals({
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      orderTaxRate: parsedForm.data.orderTax,
      discount: parsedForm.data.discount,
      shipping: parsedForm.data.shipping,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid transfer totals.",
    };
  }

  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.discount.greaterThan(maxStoredMoney)
    || totals.shipping.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Transfer totals exceed the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const original = await transaction.transfer.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: {
          id: true,
          fromWarehouseId: true,
          toWarehouseId: true,
          status: true,
          items: { select: { productId: true, quantity: true } },
        },
      });
      if (!original) throw new Error("This transfer is invalid or no longer available.");

      const [fromWarehouse, toWarehouse, products] = await Promise.all([
        transaction.warehouse.findFirst({
          where: { id: parsedForm.data.fromWarehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.warehouse.findFirst({
          where: { id: parsedForm.data.toWarehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.product.findMany({
          where: {
            id: { in: parsedForm.data.items.map((item) => item.productId) },
            deletedAt: null,
          },
          select: { id: true, name: true },
        }),
      ]);

      if (!fromWarehouse) throw new Error("The selected source warehouse is no longer available.");
      if (!toWarehouse) throw new Error("The selected destination warehouse is no longer available.");
      if (fromWarehouse.id === toWarehouse.id) {
        throw new Error("Source and destination warehouses must be different.");
      }
      if (products.length !== parsedForm.data.items.length) {
        throw new Error("One or more selected products are no longer available.");
      }

      const originalSnapshot: TransferStockSnapshot = {
        fromWarehouseId: original.fromWarehouseId,
        toWarehouseId: original.toWarehouseId,
        status: original.status,
        items: original.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity.toString(),
        })),
      };
      const updatedSnapshot: TransferStockSnapshot = {
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
        status: parsedForm.data.status,
        items: parsedForm.data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      };
      const stockDeltas = calculateTransferStockDeltas(originalSnapshot, updatedSnapshot);
      const productById = new Map(products.map((product) => [product.id, product]));

      for (const delta of stockDeltas) {
        if (delta.type !== "Subtraction") continue;
        const product = productById.get(delta.productId);
        if (!product) throw new Error("One or more selected products are no longer available.");

        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName: product.name,
          warehouseId: delta.warehouseId,
          quantity: delta.quantity,
          type: delta.type,
          documentLabel: "transfer edit",
        });
      }
      for (const delta of stockDeltas) {
        if (delta.type !== "Addition") continue;
        const product = productById.get(delta.productId);
        if (!product) throw new Error("One or more selected products are no longer available.");

        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName: product.name,
          warehouseId: delta.warehouseId,
          quantity: delta.quantity,
          type: delta.type,
          documentLabel: "transfer edit",
        });
      }

      // Reconcile stock deltas from the original move to the edited move; do not apply a second full transfer.
      await transaction.transfer.update({
        where: { id: original.id },
        data: {
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId: toWarehouse.id,
          date: new Date(`${parsedForm.data.date}T00:00:00.000Z`),
          status: parsedForm.data.status,
          orderTax: new Prisma.Decimal(parsedForm.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          notes: parsedForm.data.notes,
          items: {
            deleteMany: {},
            create: parsedForm.data.items.map((item, index) => ({
              productId: item.productId,
              netUnitCost: new Prisma.Decimal(item.netUnitCost),
              quantity: new Prisma.Decimal(item.quantity),
              discountType: item.discountType,
              discount: new Prisma.Decimal(item.discount),
              taxType: item.taxType,
              orderTax: new Prisma.Decimal(item.orderTax),
              subtotal: lineTotals[index].subtotal,
            })),
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError || error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && [
      "This transfer is invalid or no longer available.",
      "The selected source warehouse is no longer available.",
      "The selected destination warehouse is no longer available.",
      "Source and destination warehouses must be different.",
      "One or more selected products are no longer available.",
    ].includes(error.message)) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Inventory changed while saving. Refresh the page and try again." };
    }
    throw error;
  }

  revalidatePath("/transfers");
  revalidatePath("/transfers/[id]", "page");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/transfers?updated=1");
}

export async function deleteTransfer(
  _previousState: TransferCreateActionState,
  formData: FormData,
): Promise<TransferCreateActionState> {
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a transfer." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage transfers." };
  }

  const parsedId = transferIdSchema.safeParse(formData.get("transferId"));
  if (!parsedId.success) {
    return { status: "error", message: "This transfer could not be found." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const transfer = await transaction.transfer.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: {
          id: true,
          fromWarehouseId: true,
          toWarehouseId: true,
          status: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!transfer) {
        throw new Error("This transfer no longer exists or has already been deleted.");
      }

      const stockDeltas = calculateTransferDeleteStockDeltas({
        fromWarehouseId: transfer.fromWarehouseId,
        toWarehouseId: transfer.toWarehouseId,
        status: transfer.status,
        items: transfer.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity.toString(),
        })),
      });
      const productNameById = new Map(
        transfer.items.map((item) => [item.productId, item.product.name]),
      );

      // Deletion reverses the original transfer: completed quantities return to the source and leave the destination.
      for (const delta of stockDeltas) {
        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName: productNameById.get(delta.productId) ?? "product",
          warehouseId: delta.warehouseId,
          quantity: delta.quantity,
          type: delta.type,
          documentLabel: "transfer deletion",
        });
      }

      const deleted = await transaction.transfer.updateMany({
        where: { id: transfer.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (deleted.count !== 1) {
        throw new Error("This transfer could not be deleted. Refresh and try again.");
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError || error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (
      error instanceof Error &&
      (error.message === "This transfer no longer exists or has already been deleted." ||
        error.message === "This transfer could not be deleted. Refresh and try again.")
    ) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Stock changed while deleting. Refresh and try again." };
    }
    throw error;
  }

  revalidatePath("/transfers");
  revalidatePath("/transfers/[id]", "page");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/transfers?deleted=1");
}

function parseTransferFormData(formData: FormData) {
  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return {
      success: false as const,
      error: { status: "error" as const, message: "Transfer items are invalid. Review the products and try again." },
    };
  }

  const parsed = transferCreateSchema.safeParse({
    fromWarehouseId: formData.get("fromWarehouseId"),
    toWarehouseId: formData.get("toWarehouseId"),
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
      success: false as const,
      error: {
        status: "error" as const,
        message: parsed.error.issues[0]?.message ?? "Enter valid transfer details.",
      },
    };
  }
  return { success: true as const, data: parsed.data };
}

export async function searchTransferProducts(
  warehouseId: string,
  query: string,
): Promise<TransferProductSearchResult> {
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before searching products." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage transfers." };
  }

  const parsed = transferProductSearchSchema.safeParse({ warehouseId, query });
  if (!parsed.success) {
    return { status: "error", message: "Choose a source warehouse and enter at least 2 search characters." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsed.data.warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected source warehouse is no longer available." };
  }

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      productStocks: {
        some: {
          warehouseId: warehouse.id,
          quantity: { gt: 0 },
        },
      },
      OR: [
        { code: { contains: parsed.data.query } },
        { name: { contains: parsed.data.query } },
      ],
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
        where: { warehouseId: warehouse.id, quantity: { gt: 0 } },
        select: { quantity: true },
        take: 1,
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
      stock: product.productStocks[0].quantity.toString(),
    })),
  };
}

export async function getTransferProductStocks(
  warehouseId: string,
  productIds: string[],
  transferId: string | null,
): Promise<TransferProductStocksResult> {
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before loading transfer stock." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage transfers." };
  }

  const parsed = transferProductStocksSchema.safeParse({ warehouseId, productIds, transferId });
  if (!parsed.success) {
    return { status: "error", message: "The selected source warehouse or products are invalid." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsed.data.warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected source warehouse is no longer available." };
  }

  const [stocks, original] = await Promise.all([
    db.productStock.findMany({
      where: {
        warehouseId: warehouse.id,
        productId: { in: parsed.data.productIds },
      },
      select: { productId: true, quantity: true },
    }),
    parsed.data.transferId
      ? db.transfer.findFirst({
          where: { id: parsed.data.transferId, deletedAt: null },
          select: {
            fromWarehouseId: true,
            status: true,
            items: { select: { productId: true, quantity: true } },
          },
        })
      : Promise.resolve(null),
  ]);
  if (parsed.data.transferId && !original) {
    return { status: "error", message: "This transfer is invalid or no longer available." };
  }

  const stockByProductId = new Map(
    stocks.map((stock) => [stock.productId, stock.quantity]),
  );
  if (original?.fromWarehouseId === warehouse.id) {
    const sourceWithdrawal = getTransferStockOperations(original.status)
      .some((operation) => operation.warehouse === "from" && operation.type === "Subtraction");
    if (sourceWithdrawal) {
      for (const item of original.items) {
        if (!parsed.data.productIds.includes(item.productId)) continue;
        const current = stockByProductId.get(item.productId) ?? new Prisma.Decimal(0);
        stockByProductId.set(item.productId, current.plus(item.quantity));
      }
    }
  }

  return {
    status: "success",
    stocks: parsed.data.productIds.map((productId) => ({
      productId,
      stock: (stockByProductId.get(productId) ?? new Prisma.Decimal(0)).toString(),
    })),
  };
}
