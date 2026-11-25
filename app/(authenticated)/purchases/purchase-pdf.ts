import { generateTransactionDocumentPdf } from "@/lib/transaction-document-pdf";

export type PurchasePdfData = {
  businessName?: string;
  documentType?: "Purchase" | "Purchase Return";
  reference: string;
  date: string;
  createdOn: string;
  status: string;
  supplier: string;
  supplierAddress: string;
  supplierEmail: string;
  supplierPhone: string;
  warehouse: string;
  warehouseLocation: string;
  warehousePhone: string;
  paymentType: string;
  paymentStatus: string;
  paid?: string;
  due?: string;
  notes: string;
  subtotal: string;
  orderTax: string;
  orderTaxRate: string;
  discount: string;
  shipping: string;
  grandTotal: string;
  items: {
    name: string;
    code: string;
    unitCost: string;
    quantity: string;
    unit: string;
    discount: string;
    discountType: string;
    taxType: string;
    taxRate: string;
    subtotal: string;
  }[];
};

export function generatePurchasePdf(purchase: PurchasePdfData): Promise<Buffer> {
  const isReturn = purchase.documentType === "Purchase Return";
  const documentType = isReturn ? "Debit Note" : "Purchase Bill";
  const paid = purchase.paid;
  const due = purchase.due;

  return generateTransactionDocumentPdf({
    businessName: purchase.businessName ?? "Warehouse",
    documentType,
    reference: purchase.reference,
    date: purchase.date,
    createdOn: purchase.createdOn,
    status: purchase.status,
    issuerLabel: isReturn ? "Issued by" : "Supplier",
    issuerName: isReturn ? (purchase.businessName ?? "Warehouse") : purchase.supplier,
    issuerDetails: isReturn
      ? [purchase.warehouse, purchase.warehouseLocation, purchase.warehousePhone]
      : [purchase.supplierAddress, purchase.supplierEmail, purchase.supplierPhone],
    recipientLabel: isReturn ? "Debit to" : "Deliver to",
    recipientName: isReturn ? purchase.supplier : purchase.warehouse,
    recipientDetails: isReturn
      ? [purchase.supplierAddress, purchase.supplierEmail, purchase.supplierPhone]
      : [purchase.warehouseLocation, purchase.warehousePhone],
    metadata: [
      { label: isReturn ? "Return date" : "Bill date", value: purchase.date },
      { label: "Payment type", value: purchase.paymentType },
      { label: "Payment status", value: purchase.paymentStatus },
      { label: "Warehouse", value: purchase.warehouse },
    ],
    notes: purchase.notes,
    subtotal: purchase.subtotal,
    orderTax: purchase.orderTax,
    orderTaxRate: purchase.orderTaxRate,
    discount: purchase.discount,
    shipping: purchase.shipping,
    grandTotal: purchase.grandTotal,
    totalLabel: isReturn ? "Debit total" : "Bill total",
    ...(paid !== undefined ? { paid, paidLabel: "Paid to date" } : {}),
    ...(due !== undefined ? { due, dueLabel: "Balance due" } : {}),
    items: purchase.items.map((item) => ({
      ...item,
      unitPrice: item.unitCost,
    })),
  });
}
