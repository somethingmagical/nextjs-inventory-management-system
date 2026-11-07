import { db } from "@/lib/db";

export async function getPurchaseReturnDetails(purchaseReturnId: string) {
  return db.purchaseReturn.findFirst({
    where: { id: purchaseReturnId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      supplierId: true,
      warehouseId: true,
      date: true,
      status: true,
      orderTax: true,
      discount: true,
      shipping: true,
      grandTotal: true,
      paid: true,
      due: true,
      paymentType: true,
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
          product: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });
}

export type PurchaseReturnDetails = NonNullable<
  Awaited<ReturnType<typeof getPurchaseReturnDetails>>
>;
