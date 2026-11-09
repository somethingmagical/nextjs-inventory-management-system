"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSaleReturn as createSaleReturnUseCase,
  deleteSaleReturn as deleteSaleReturnUseCase,
  InsufficientStockError,
  SaleReturnCreateError,
  SaleReturnUpdateError,
  StockQuantityLimitError,
  updateSaleReturn as updateSaleReturnUseCase,
} from "@/features/sales/returns";
import {
  calculatePurchaseLineTotals,
  calculatePurchaseTotals,
} from "@/lib/purchase-pricing";
import { getSaleReturnAccess } from "../../authorization";
import type { SaleReturnCreateActionState } from "./action-state";
import { saleReturnCreateSchema, saleReturnIdSchema } from "../sale-return-schema";

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
    await createSaleReturnUseCase({
      ...parsed.data,
      discount: totals.discount,
      shipping: totals.shipping,
      grandTotal: totals.grandTotal,
      items: parsed.data.items,
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      actorId: access.userId,
    });
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
    await updateSaleReturnUseCase({
      ...parsed.data,
      id: parsedId.data,
      discount: totals.discount,
      shipping: totals.shipping,
      grandTotal: totals.grandTotal,
      items: parsed.data.items,
      lineSubtotals: lineTotals.map((line) => line.subtotal),
      actorId: access.userId,
    });
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
    await deleteSaleReturnUseCase(parsedId.data, access.userId);
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
