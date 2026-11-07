"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSaleAccess } from "../../authorization";
import type { SalePaymentActionState } from "./action-state";
import { saleIdSchema, salePaymentSchema } from "./payment-schema";

class SalePaymentError extends Error {}

export async function addSalePayment(
  saleId: string,
  _previousState: SalePaymentActionState,
  formData: FormData,
): Promise<SalePaymentActionState> {
  const access = await getSaleAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before adding a payment." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage sales." };
  }

  const parsedId = saleIdSchema.safeParse(saleId);
  if (!parsedId.success) {
    return { status: "error", message: "The selected sale is invalid." };
  }

  const parsedPayment = salePaymentSchema.safeParse({
    amount: formData.get("amount"),
    paymentType: formData.get("paymentType"),
    date: formData.get("date"),
    notes: formData.get("notes") || null,
  });
  if (!parsedPayment.success) {
    return {
      status: "error",
      message: parsedPayment.error.issues[0]?.message ?? "Enter valid payment details.",
    };
  }

  const amount = new Prisma.Decimal(parsedPayment.data.amount);
  const maxStoredMoney = new Prisma.Decimal("9999999999.99");
  if (amount.greaterThan(maxStoredMoney)) {
    return { status: "error", message: "Payment amount exceeds the supported amount." };
  }

  try {
    await db.$transaction(async (transaction) => {
      const sale = await transaction.sale.findFirst({
        where: { id: parsedId.data, deletedAt: null },
        select: { id: true, grandTotal: true },
      });
      if (!sale) throw new SalePaymentError("This sale is no longer available.");

      await transaction.salePayment.create({
        data: {
          saleId: sale.id,
          amount,
          paymentType: parsedPayment.data.paymentType,
          date: new Date(`${parsedPayment.data.date}T00:00:00.000Z`),
          notes: parsedPayment.data.notes,
        },
      });

      const paymentTotals = await transaction.salePayment.aggregate({
        where: { saleId: sale.id },
        _sum: { amount: true },
      });
      const paid = paymentTotals._sum.amount ?? new Prisma.Decimal(0);
      if (paid.greaterThan(maxStoredMoney)) {
        throw new SalePaymentError("The total payments exceed the supported amount.");
      }

      const due = Prisma.Decimal.max(sale.grandTotal.minus(paid), new Prisma.Decimal(0));
      const paymentStatus = paid.isZero()
        ? "Unpaid"
        : paid.greaterThanOrEqualTo(sale.grandTotal)
          ? "Paid"
          : "Partial";

      await transaction.sale.update({
        where: { id: sale.id },
        data: { paid, due, paymentStatus },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof SalePaymentError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return {
        status: "error",
        message: "Payments changed while saving. Refresh the page and try again.",
      };
    }
    throw error;
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${encodeURIComponent(parsedId.data)}/payments`);
  redirect(`/sales/${encodeURIComponent(parsedId.data)}/payments?added=1`);
}
