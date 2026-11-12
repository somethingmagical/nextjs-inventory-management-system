import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getSaleViewAccess } from "../../authorization";
import { saleIdSchema } from "../payments/payment-schema";
import { generateSalePdf } from "../../sale-pdf";

type SalePdfRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: SalePdfRouteContext) {
  const access = await getSaleViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") {
    return new Response("You do not have permission to manage sales.", { status: 403 });
  }

  const { id } = await params;
  const parsedId = saleIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const sale = await db.sale.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      reference: true,
      date: true,
      status: true,
      orderTax: true,
      discount: true,
      shipping: true,
      grandTotal: true,
      paid: true,
      due: true,
      paymentStatus: true,
      paymentType: true,
      notes: true,
      createdAt: true,
      customer: {
        select: { name: true, email: true, phoneNumber: true, address: true, city: true, country: true },
      },
      warehouse: {
        select: { name: true, phoneNumber: true, city: true, country: true },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          netUnitPrice: true,
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
      payments: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { date: true, amount: true, paymentType: true, notes: true },
      },
    },
  });
  if (!sale) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: sale.items.map((item) => item.subtotal),
    orderTaxRate: sale.orderTax,
    discount: sale.discount,
    shipping: sale.shipping,
  });
  const pdf = await generateSalePdf({
    reference: sale.reference,
    date: formatDate(sale.date),
    createdOn: sale.createdAt.toLocaleString("en"),
    status: sale.status,
    customer: sale.customer.name,
    customerAddress: [sale.customer.address, sale.customer.city, sale.customer.country]
      .filter(Boolean)
      .join(", "),
    customerEmail: sale.customer.email,
    customerPhone: sale.customer.phoneNumber,
    warehouse: sale.warehouse?.name ?? "Warehouse unavailable",
    warehouseLocation: sale.warehouse
      ? [sale.warehouse.city, sale.warehouse.country].filter(Boolean).join(", ")
      : "Warehouse unavailable",
    warehousePhone: sale.warehouse?.phoneNumber ?? "Warehouse unavailable",
    paymentType: sale.paymentType,
    paymentStatus: sale.paymentStatus,
    paid: sale.paid.toFixed(2),
    due: sale.due.toFixed(2),
    notes: sale.notes ?? "",
    orderTax: totals.orderTax.toFixed(2),
    orderTaxRate: sale.orderTax.toFixed(2),
    discount: sale.discount.toFixed(2),
    shipping: sale.shipping.toFixed(2),
    grandTotal: sale.grandTotal.toFixed(2),
    items: sale.items.map((item) => ({
      name: item.product.name,
      code: item.product.code,
      unitPrice: item.netUnitPrice.toFixed(2),
      quantity: item.quantity.toString(),
      unit: item.unit,
      discount: item.discount.toFixed(2),
      discountType: item.discountType,
      taxType: item.taxType,
      taxRate: item.orderTax.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
    })),
    payments: sale.payments.map((payment) => ({
      date: formatDate(payment.date),
      amount: payment.amount.toFixed(2),
      paymentType: payment.paymentType,
      notes: payment.notes ?? "",
    })),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(sale.reference)}.pdf"`,
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function safeFilename(reference: string) {
  return reference.replace(/[^A-Za-z0-9_-]/g, "_");
}
