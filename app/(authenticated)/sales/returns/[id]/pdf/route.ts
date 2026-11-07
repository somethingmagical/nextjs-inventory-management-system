import { notFound, redirect } from "next/navigation";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getSaleReturnAccess } from "../../../authorization";
import { getSaleReturnDetails } from "../../sale-return-details";
import { saleReturnIdSchema } from "../../sale-return-schema";
import { generateSalePdf } from "../../../sale-pdf";

type SaleReturnPdfRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: SaleReturnPdfRouteContext) {
  const access = await getSaleReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") {
    return new Response("You do not have permission to manage sale returns.", { status: 403 });
  }

  const { id } = await params;
  const parsedId = saleReturnIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const saleReturn = await getSaleReturnDetails(parsedId.data);
  if (!saleReturn) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: saleReturn.items.map((item) => item.subtotal),
    orderTaxRate: saleReturn.orderTax,
    discount: saleReturn.discount,
    shipping: saleReturn.shipping,
  });
  const pdf = await generateSalePdf({
    documentType: "Sale Return",
    relatedSaleReference: saleReturn.sale?.reference ?? "",
    reference: saleReturn.reference,
    date: formatDate(saleReturn.date),
    createdOn: saleReturn.createdAt.toLocaleString("en"),
    status: saleReturn.status,
    customer: saleReturn.customer.name,
    customerAddress: [
      saleReturn.customer.address,
      saleReturn.customer.city,
      saleReturn.customer.country,
    ].filter(Boolean).join(", "),
    customerEmail: saleReturn.customer.email,
    customerPhone: saleReturn.customer.phoneNumber,
    warehouse: saleReturn.warehouse.name,
    warehouseLocation: [saleReturn.warehouse.city, saleReturn.warehouse.country].filter(Boolean).join(", "),
    warehousePhone: saleReturn.warehouse.phoneNumber,
    paymentType: "",
    paymentStatus: saleReturn.paymentStatus,
    paid: saleReturn.paid.toFixed(2),
    due: saleReturn.due.toFixed(2),
    notes: saleReturn.notes ?? "",
    orderTax: totals.orderTax.toFixed(2),
    orderTaxRate: saleReturn.orderTax.toFixed(2),
    discount: saleReturn.discount.toFixed(2),
    shipping: saleReturn.shipping.toFixed(2),
    grandTotal: saleReturn.grandTotal.toFixed(2),
    items: saleReturn.items.map((item) => ({
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
    payments: [],
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(saleReturn.reference)}.pdf"`,
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
