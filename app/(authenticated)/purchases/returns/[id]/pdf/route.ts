import { notFound, redirect } from "next/navigation";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getPurchaseReturnAccess } from "../../authorization";
import { purchaseReturnIdSchema } from "../../purchase-return-create-schema";
import { getPurchaseReturnDetails } from "../../purchase-return-details";
import { generatePurchasePdf } from "../../../purchase-pdf";

type PurchaseReturnPdfRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: PurchaseReturnPdfRouteContext) {
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") {
    return new Response("You do not have permission to manage purchase returns.", { status: 403 });
  }

  const { id } = await params;
  const parsedId = purchaseReturnIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const purchaseReturn = await getPurchaseReturnDetails(parsedId.data);
  if (!purchaseReturn) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: purchaseReturn.items.map((item) => item.subtotal),
    orderTaxRate: purchaseReturn.orderTax,
    discount: purchaseReturn.discount,
    shipping: purchaseReturn.shipping,
  });
  const pdf = await generatePurchasePdf({
    documentType: "Purchase Return",
    reference: purchaseReturn.reference,
    date: formatDate(purchaseReturn.date),
    createdOn: purchaseReturn.createdAt.toLocaleString("en"),
    status: purchaseReturn.status,
    supplier: purchaseReturn.supplier.name,
    supplierAddress: [
      purchaseReturn.supplier.address,
      purchaseReturn.supplier.city,
      purchaseReturn.supplier.country,
    ].filter(Boolean).join(", "),
    supplierEmail: purchaseReturn.supplier.email,
    supplierPhone: purchaseReturn.supplier.phoneNumber,
    warehouse: purchaseReturn.warehouse.name,
    warehouseLocation: [
      purchaseReturn.warehouse.city,
      purchaseReturn.warehouse.country,
    ].filter(Boolean).join(", "),
    warehousePhone: purchaseReturn.warehouse.phoneNumber,
    paymentType: purchaseReturn.paymentType,
    paymentStatus: "",
    paid: purchaseReturn.paid.toFixed(2),
    due: purchaseReturn.due.toFixed(2),
    notes: purchaseReturn.notes ?? "",
    orderTax: totals.orderTax.toFixed(2),
    orderTaxRate: purchaseReturn.orderTax.toFixed(2),
    discount: purchaseReturn.discount.toFixed(2),
    shipping: purchaseReturn.shipping.toFixed(2),
    grandTotal: purchaseReturn.grandTotal.toFixed(2),
    items: purchaseReturn.items.map((item) => ({
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
      "Content-Disposition": `attachment; filename="${safeFilename(purchaseReturn.reference)}.pdf"`,
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
