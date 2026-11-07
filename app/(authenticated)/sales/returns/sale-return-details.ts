import { db } from "@/lib/db";

export async function getSaleReturnDetails(saleReturnId: string) {
  return db.saleReturn.findFirst({
    where: { id: saleReturnId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      warehouseId: true,
      date: true,
      status: true,
      orderTax: true,
      discount: true,
      shipping: true,
      grandTotal: true,
      paid: true,
      due: true,
      paymentStatus: true,
      notes: true,
      createdAt: true,
      sale: { select: { id: true, reference: true, deletedAt: true } },
      customer: {
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
          netUnitPrice: true,
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

export type SaleReturnDetails = NonNullable<Awaited<ReturnType<typeof getSaleReturnDetails>>>;
