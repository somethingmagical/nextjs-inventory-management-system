"use server";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { calculateSaleReturnStockDeltas } from "@/lib/sale-return-stock";
import { getSaleReturnAccess } from "../../authorization";
import type { SaleReturnCreateActionState } from "./action-state";
import { saleReturnCreateSchema, saleReturnIdSchema } from "../sale-return-schema";

class SaleReturnCreateError extends Error {}

class SaleReturnUpdateError extends Error {}

export async function createSaleReturn(
  _previousState: SaleReturnCreateActionState,
  formData: FormData,
): Promise<SaleReturnCreateActionState> {
  const access = await getSaleReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a sale return." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage sale returns." };
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return {
      status: "error",
      message: "Sale return items are invalid. Review the products and try again.",
    };
  }

  const parsed = saleReturnCreateSchema.safeParse({
    saleId: formData.get("saleId"),
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
      message: parsed.error.issues[0]?.message ?? "Enter valid sale return details.",
    };
  }

  const lineTotals: ReturnType<typeof calculatePurchaseLineTotals>[] = [];
  let totals: ReturnType<typeof calculatePurchaseTotals>;
  try {
    for (const item of parsed.data.items) {
      lineTotals.push(calculatePurchaseLineTotals({
        unitCost: item.price,
        quantity: item.quantity,
        discountType: item.discountType,
        discount: item.discount,
        taxType: item.taxType,
        taxRate: item.orderTax,
      }));
    }
    totals = calculatePurchaseTotals({
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      orderTaxRate: parsed.data.orderTax,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid sale return pricing details.",
    };
  }

  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (
    lineTotals.some((line) => line.subtotal.greaterThan(maxStoredMoney))
    || totals.subtotal.greaterThan(maxStoredMoney)
    || totals.orderTax.greaterThan(maxStoredMoney)
    || totals.grandTotal.greaterThan(maxStoredMoney)
  ) {
    return { status: "error", message: "Sale return totals exceed the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const sale = await transaction.sale.findFirst({
        where: { id: parsed.data.saleId, deletedAt: null },
        select: {
          id: true,
          customerId: true,
          warehouseId: true,
          customer: { select: { deletedAt: true } },
          warehouse: { select: { deletedAt: true } },
          items: {
            select: {
              productId: true,
              quantity: true,
              unit: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!sale || sale.customer.deletedAt || sale.warehouse.deletedAt) {
        throw new SaleReturnCreateError("The original sale is no longer available.");
      }

      const saleItemsByProductId = new Map(
        sale.items.map((item) => [item.productId, item]),
      );
      if (parsed.data.items.some((item) => !saleItemsByProductId.has(item.productId))) {
        throw new SaleReturnCreateError("Sale returns can only include products from the original sale.");
      }

      const priorReturns = await transaction.saleReturn.findMany({
        where: { saleId: sale.id, deletedAt: null },
        select: {
          items: { select: { productId: true, quantity: true } },
        },
      });
      const previouslyReturned = new Map<string, Prisma.Decimal>();
      for (const saleReturn of priorReturns) {
        for (const item of saleReturn.items) {
          previouslyReturned.set(
            item.productId,
            (previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity),
          );
        }
      }

      for (const item of parsed.data.items) {
        const saleItem = saleItemsByProductId.get(item.productId);
        if (!saleItem) {
          throw new SaleReturnCreateError("Sale returns can only include products from the original sale.");
        }

        const returnQuantity = new Prisma.Decimal(item.quantity);
        const totalReturning = (previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0))
          .plus(returnQuantity);
        if (totalReturning.greaterThan(saleItem.quantity)) {
          throw new SaleReturnCreateError(
            `Returned quantity for ${saleItem.product.name} cannot exceed the quantity sold (${saleItem.quantity.toString()}).`,
          );
        }

        if (item.unit !== saleItem.unit) {
          const unit = await transaction.unit.findFirst({
            where: { name: item.unit, deletedAt: null },
            select: { name: true },
          });
          if (!unit) {
            throw new SaleReturnCreateError("One or more selected sale return units are no longer available.");
          }
        }
      }

      const reference = `SR_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const createdReturn = await transaction.saleReturn.create({
        data: {
          reference,
          customerId: sale.customerId,
          warehouseId: sale.warehouseId,
          saleId: sale.id,
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          status: parsed.data.status,
          orderTax: new Prisma.Decimal(parsed.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          paid: new Prisma.Decimal(0),
          due: totals.grandTotal,
          paymentStatus: "Unpaid",
          notes: parsed.data.notes,
          items: {
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId,
              netUnitPrice: new Prisma.Decimal(item.price),
              quantity: new Prisma.Decimal(item.quantity),
              unit: item.unit,
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
        const saleItem = saleItemsByProductId.get(item.productId);
        if (!saleItem) {
          throw new SaleReturnCreateError("Sale returns can only include products from the original sale.");
        }
        await applyStockAdjustment(transaction, {
          productId: saleItem.productId,
          productName: saleItem.product.name,
          warehouseId: sale.warehouseId,
          quantity: item.quantity,
          type: "Addition",
          documentLabel: "sale return",
        });
      }

      return createdReturn.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof SaleReturnCreateError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        status: "error",
        message: "Inventory or return quantities changed while saving. Refresh and try again.",
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "error", message: "The sale return reference conflicted. Please submit it again." };
    }
    throw error;
  }

  revalidatePath("/sales/returns");
  revalidatePath("/sales");
  revalidatePath(`/sales/${encodeURIComponent(parsed.data.saleId)}`);
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/sales/returns?created=1");
}

export async function updateSaleReturn(
  saleReturnId: string,
  _previousState: SaleReturnCreateActionState,
  formData: FormData,
): Promise<SaleReturnCreateActionState> {
  const access = await getSaleReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before editing a sale return." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage sale returns." };
  }

  const parsedId = saleReturnIdSchema.safeParse(saleReturnId);
  if (!parsedId.success) {
    return { status: "error", message: "This sale return could not be found." };
  }

  const rawItems = formData.get("items");
  let items: unknown;
  try {
    items = JSON.parse(typeof rawItems === "string" ? rawItems : "");
  } catch {
    return {
      status: "error",
      message: "Sale return items are invalid. Review the products and try again.",
    };
  }

  const parsed = saleReturnCreateSchema.safeParse({
    saleId: formData.get("saleId"),
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
      message: parsed.error.issues[0]?.message ?? "Enter valid sale return details.",
    };
  }

  let lineTotals: ReturnType<typeof calculatePurchaseLineTotals>[];
  let totals: ReturnType<typeof calculatePurchaseTotals>;
  try {
    lineTotals = parsed.data.items.map((item) => calculatePurchaseLineTotals({
      unitCost: item.price,
      quantity: item.quantity,
      discountType: item.discountType,
      discount: item.discount,
      taxType: item.taxType,
      taxRate: item.orderTax,
    }));
    totals = calculatePurchaseTotals({
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      orderTaxRate: parsed.data.orderTax,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter valid sale return pricing details.",
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
    return { status: "error", message: "Sale return totals exceed the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const existingReturn = await transaction.saleReturn.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: {
          id: true,
          saleId: true,
          warehouseId: true,
          paid: true,
          items: { select: { productId: true, quantity: true } },
        },
      });
      if (!existingReturn) {
        throw new SaleReturnUpdateError("This sale return no longer exists or has already been deleted.");
      }
      if (!existingReturn.saleId || existingReturn.saleId !== parsed.data.saleId) {
        throw new SaleReturnUpdateError("The original sale for this return is no longer available.");
      }

      const sale = await transaction.sale.findFirst({
        where: { id: existingReturn.saleId, deletedAt: null },
        select: {
          id: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              unit: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!sale) {
        throw new SaleReturnUpdateError("The original sale is no longer available.");
      }

      const saleItemsByProductId = new Map<string, {
        quantity: Prisma.Decimal;
        unit: string;
        productName: string;
      }>();
      for (const saleItem of sale.items) {
        const existing = saleItemsByProductId.get(saleItem.productId);
        saleItemsByProductId.set(saleItem.productId, {
          quantity: (existing?.quantity ?? new Prisma.Decimal(0)).plus(saleItem.quantity),
          unit: saleItem.unit,
          productName: saleItem.product.name,
        });
      }

      const priorReturns = await transaction.saleReturn.findMany({
        where: {
          saleId: sale.id,
          deletedAt: null,
          id: { not: existingReturn.id },
        },
        select: { items: { select: { productId: true, quantity: true } } },
      });
      const previouslyReturned = new Map<string, Prisma.Decimal>();
      for (const saleReturn of priorReturns) {
        for (const item of saleReturn.items) {
          previouslyReturned.set(
            item.productId,
            (previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity),
          );
        }
      }

      const customUnits = new Set<string>();
      for (const item of parsed.data.items) {
        const saleItem = saleItemsByProductId.get(item.productId);
        if (!saleItem) {
          throw new SaleReturnUpdateError("Sale returns can only include products from the original sale.");
        }
        const returnQuantity = new Prisma.Decimal(item.quantity);
        if ((previouslyReturned.get(item.productId) ?? new Prisma.Decimal(0))
          .plus(returnQuantity).greaterThan(saleItem.quantity)) {
          throw new SaleReturnUpdateError(
            `Returned quantity for ${saleItem.productName} cannot exceed the remaining quantity available from the sale.`,
          );
        }
        if (item.unit !== saleItem.unit) customUnits.add(item.unit);
      }

      if (customUnits.size > 0) {
        const activeUnits = await transaction.unit.findMany({
          where: { name: { in: Array.from(customUnits) }, deletedAt: null },
          select: { name: true },
        });
        const activeUnitNames = new Set(activeUnits.map((unit) => unit.name));
        if (Array.from(customUnits).some((unit) => !activeUnitNames.has(unit))) {
          throw new SaleReturnUpdateError("One or more selected sale return units are no longer available.");
        }
      }

      // Reconcile only the old/new returned-quantity difference; applying the full new return again would double-count stock.
      const stockDeltas = calculateSaleReturnStockDeltas(
        existingReturn.items,
        parsed.data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      );
      for (const delta of stockDeltas) {
        const saleItem = saleItemsByProductId.get(delta.productId);
        if (!saleItem) {
          throw new SaleReturnUpdateError("The original sale no longer contains a returned product.");
        }
        await applyStockAdjustment(transaction, {
          productId: delta.productId,
          productName: saleItem.productName,
          warehouseId: existingReturn.warehouseId,
          quantity: delta.quantity.toString(),
          type: delta.type,
          documentLabel: "sale return edit",
        });
      }

      const paid = existingReturn.paid;
      if (paid.greaterThan(maxStoredMoney)) {
        throw new SaleReturnUpdateError("The recorded refund exceeds the supported amount.");
      }
      const due = Prisma.Decimal.max(totals.grandTotal.minus(paid), new Prisma.Decimal(0));
      const paymentStatus = paid.isZero()
        ? "Unpaid"
        : paid.greaterThanOrEqualTo(totals.grandTotal)
          ? "Paid"
          : "Partial";

      await transaction.saleReturn.update({
        where: { id: existingReturn.id },
        data: {
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          status: parsed.data.status,
          orderTax: new Prisma.Decimal(parsed.data.orderTax),
          discount: totals.discount,
          shipping: totals.shipping,
          grandTotal: totals.grandTotal,
          paid,
          due,
          paymentStatus,
          notes: parsed.data.notes,
          items: {
            deleteMany: {},
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId,
              netUnitPrice: new Prisma.Decimal(item.price),
              quantity: new Prisma.Decimal(item.quantity),
              unit: item.unit,
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
    if (error instanceof SaleReturnUpdateError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        status: "error",
        message: "Inventory or return quantities changed while saving. Refresh and try again.",
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { status: "error", message: "This sale return could not be updated because it no longer exists." };
    }
    throw error;
  }

  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${encodeURIComponent(parsedId.data)}`);
  revalidatePath(`/sales/returns/${encodeURIComponent(parsedId.data)}/pdf`);
  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect(`/sales/returns/${encodeURIComponent(parsedId.data)}?updated=1`);
}

export async function deleteSaleReturn(
  saleReturnId: string,
): Promise<SaleReturnCreateActionState> {
  const access = await getSaleReturnAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a sale return." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage sale returns." };
  }

  const parsedId = saleReturnIdSchema.safeParse(saleReturnId);
  if (!parsedId.success) {
    return { status: "error", message: "This sale return could not be found." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const saleReturn = await transaction.saleReturn.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: {
          id: true,
          warehouseId: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!saleReturn) {
        throw new SaleReturnUpdateError("This sale return no longer exists or has already been deleted.");
      }

      // Deleting a sale return removes goods previously added back to inventory, opposite to deleting a sale.
      for (const item of saleReturn.items) {
        await applyStockAdjustment(transaction, {
          productId: item.productId,
          productName: item.product.name,
          warehouseId: saleReturn.warehouseId,
          quantity: item.quantity.toString(),
          type: "Subtraction",
          documentLabel: "sale return deletion",
        });
      }

      const updated = await transaction.saleReturn.updateMany({
        where: { id: saleReturn.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new SaleReturnUpdateError("This sale return could not be deleted. Refresh and try again.");
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InsufficientStockError || error instanceof StockQuantityLimitError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof SaleReturnUpdateError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "error", message: "Stock changed while deleting. Refresh and try again." };
    }
    throw error;
  }

  revalidatePath("/sales/returns");
  revalidatePath(`/sales/returns/${encodeURIComponent(parsedId.data)}`);
  revalidatePath(`/sales/returns/${encodeURIComponent(parsedId.data)}/pdf`);
  revalidatePath("/sales");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse");
  redirect("/sales/returns?deleted=1");
}
