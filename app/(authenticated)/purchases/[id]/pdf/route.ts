import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getPurchaseViewAccess } from "../../authorization";
import { purchaseIdSchema } from "../../purchase-create-schema";
import { generatePurchasePdf } from "../../purchase-pdf";

type PurchasePdfRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: PurchasePdfRouteContext) {
  const access = await getPurchaseViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") {
    return new Response("You do not have permission to manage purchases.", { status: 403 });
  }

  const { id } = await params;
  const parsedId = purchaseIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const purchase = await db.purchase.findFirst({
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
  if (!purchase) notFound();

  const date = formatDate(purchase.date);
  const createdOn = purchase.createdAt.toLocaleString("en");
  const totals = calculatePurchaseTotals({
    lineSubtotals: purchase.items.map((item) => item.subtotal),
    orderTaxRate: purchase.orderTax,
    discount: purchase.discount,
    shipping: purchase.shipping,
  });
  const pdf = await generatePurchasePdf({
    reference: purchase.reference,
    date,
    createdOn,
    status: purchase.status,
    supplier: purchase.supplier.name,
    supplierAddress: [
      purchase.supplier.address,
      purchase.supplier.city,
      purchase.supplier.country,
    ].filter(Boolean).join(", "),
    supplierEmail: purchase.supplier.email,
    supplierPhone: purchase.supplier.phoneNumber,
    warehouse: purchase.warehouse.name,
    warehouseLocation: [purchase.warehouse.city, purchase.warehouse.country].filter(Boolean).join(", "),
    warehousePhone: purchase.warehouse.phoneNumber,
    paymentType: purchase.paymentType,
    paymentStatus: purchase.paymentStatus,
    notes: purchase.notes ?? "",
    orderTax: totals.orderTax.toFixed(2),
    orderTaxRate: purchase.orderTax.toFixed(2),
    discount: purchase.discount.toFixed(2),
    shipping: purchase.shipping.toFixed(2),
    grandTotal: purchase.grandTotal.toFixed(2),
    items: purchase.items.map((item) => ({
      name: item.product.name,
      code: item.product.code,
      unitCost: item.netUnitCost.toFixed(2),
      quantity: item.quantity.toString(),
      unit: item.unit,
      discount: item.discount.toFixed(2),
      discountType: item.discountType,
      taxType: item.taxType,
      taxRate: item.orderTax.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
    })),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(purchase.reference)}.pdf"`,
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
