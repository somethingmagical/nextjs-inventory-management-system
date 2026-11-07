import { db } from "@/lib/db";

export async function getTransferDetails(transferId: string) {
  return db.transfer.findFirst({
    where: { id: transferId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      date: true,
      status: true,
      orderTax: true,
      discount: true,
      shipping: true,
      grandTotal: true,
      notes: true,
      createdAt: true,
      fromWarehouse: {
        select: { name: true, phoneNumber: true, city: true, country: true },
      },
      toWarehouse: {
        select: { name: true, phoneNumber: true, city: true, country: true },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          netUnitCost: true,
          quantity: true,
          discountType: true,
          discount: true,
          taxType: true,
          orderTax: true,
          subtotal: true,
          product: { select: { name: true, code: true, productUnit: true } },
        },
      },
    },
  });
}
