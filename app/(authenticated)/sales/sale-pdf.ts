import { generateTransactionDocumentPdf } from "@/lib/transaction-document-pdf";

export type SalePdfData = {
  businessName?: string;
  documentType?: "Sale" | "Sale Return";
  relatedSaleReference?: string;
  reference: string;
  date: string;
  createdOn: string;
  status: string;
  customer: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;
  warehouse: string;
  warehouseLocation: string;
  warehousePhone: string;
  paymentType: string;
  paymentStatus: string;
  paid: string;
  due: string;
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
    unitPrice: string;
    quantity: string;
    unit: string;
    discount: string;
    discountType: string;
    taxType: string;
    taxRate: string;
    subtotal: string;
  }[];
  payments: {
    date: string;
    amount: string;
    paymentType: string;
    notes: string;
  }[];
};

export function generateSalePdf(sale: SalePdfData): Promise<Buffer> {
  const isReturn = sale.documentType === "Sale Return";
  const documentType = isReturn ? "Credit Note" : "Sales Invoice";

  return generateTransactionDocumentPdf({
    businessName: sale.businessName ?? "Warehouse",
    documentType,
    reference: sale.reference,
    date: sale.date,
    createdOn: sale.createdOn,
    status: sale.status,
    issuerLabel: "Issued by",
    issuerName: sale.businessName ?? "Warehouse",
    issuerDetails: [
      sale.warehouse,
      sale.warehouseLocation,
      sale.warehousePhone,
    ],
    recipientLabel: isReturn ? "Credit to" : "Bill to",
    recipientName: sale.customer,
    recipientDetails: [
      sale.customerAddress,
      sale.customerEmail,
      sale.customerPhone,
    ],
    metadata: [
      { label: isReturn ? "Return date" : "Invoice date", value: sale.date },
      { label: isReturn ? "Refund status" : "Payment type", value: isReturn ? sale.paymentStatus : sale.paymentType },
      { label: isReturn ? "Original sale" : "Payment status", value: isReturn ? sale.relatedSaleReference ?? "" : sale.paymentStatus },
      { label: "Warehouse", value: sale.warehouse },
    ],
    relatedReference: sale.relatedSaleReference,
    notes: sale.notes,
    subtotal: sale.subtotal,
    orderTax: sale.orderTax,
    orderTaxRate: sale.orderTaxRate,
    discount: sale.discount,
    shipping: sale.shipping,
    grandTotal: sale.grandTotal,
    totalLabel: isReturn ? "Credit total" : "Invoice total",
    paid: sale.paid,
    due: sale.due,
    paidLabel: isReturn ? "Refunded to date" : "Paid to date",
    dueLabel: isReturn ? "Refund due" : "Balance due",
    items: sale.items,
    payments: sale.payments,
  });
}
