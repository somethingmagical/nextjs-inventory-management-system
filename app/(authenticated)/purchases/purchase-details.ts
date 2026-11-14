import { db } from "@/lib/db";

export async function getPurchaseDetails(purchaseId: string) {
  return db.purchase.findFirst({
    where: { id: purchaseId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      date: true,
      status: true,
      deliveryStatus: true,
      orderTax: true,
      discount: true,
      shipping: true,
      grandTotal: true,
      paymentType: true,
      paymentStatus: true,
      notes: true,
      createdAt: true,
      supplier: {
        select: {
          name: true,
          email: true,
          phoneNumber: true,
          address: true,
          city: true,
          country: true,
        },
      },
      warehouse: {
        select: {
          name: true,
          phoneNumber: true,
          city: true,
          country: true,
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          netUnitCost: true,
          quantity: true,
          unit: true,
          discountType: true,
          discount: true,
          taxType: true,
          orderTax: true,
          subtotal: true,
          product: { select: { name: true, code: true } },
        },
      },
    },
  });
}

export type PurchaseDetails = NonNullable<Awaited<ReturnType<typeof getPurchaseDetails>>>;
