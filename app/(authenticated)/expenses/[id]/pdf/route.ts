import { notFound, redirect } from "next/navigation";
import { getApplicationSettings } from "@/features/settings/application";
import { db } from "@/lib/db";
import { getExpenseViewAccess } from "../../authorization";
import { expenseIdSchema } from "../../expense-schema";
import { generateTransactionDocumentPdf } from "@/lib/transaction-document-pdf";

type ExpensePdfRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: ExpensePdfRouteContext) {
  const access = await getExpenseViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") {
    return new Response("You do not have permission to view expenses.", { status: 403 });
  }

  const { id } = await params;
  const parsedId = expenseIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const expense = await db.expense.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      reference: true,
      date: true,
      title: true,
      amount: true,
      details: true,
      createdAt: true,
      expenseCategory: { select: { name: true } },
      warehouse: {
        select: { name: true, city: true, country: true, phoneNumber: true },
      },
    },
  });
  if (!expense) notFound();

  const { appName } = await getApplicationSettings();
  const amount = expense.amount.toFixed(2);
  const date = formatDate(expense.date);
  const pdf = await generateTransactionDocumentPdf({
    businessName: appName,
    documentType: "Expense Voucher",
    reference: expense.reference,
    date,
    createdOn: expense.createdAt.toLocaleString("en"),
    status: "Recorded",
    issuerLabel: "Recorded by",
    issuerName: appName,
    issuerDetails: [
      expense.warehouse.name,
      [expense.warehouse.city, expense.warehouse.country].filter(Boolean).join(", "),
      expense.warehouse.phoneNumber,
    ],
    recipientLabel: "Expense",
    recipientName: expense.title,
    recipientDetails: [expense.expenseCategory.name],
    metadata: [
      { label: "Expense date", value: date },
      { label: "Category", value: expense.expenseCategory.name },
      { label: "Warehouse", value: expense.warehouse.name },
      { label: "Recorded", value: formatDate(expense.createdAt) },
    ],
    notes: expense.details ?? "",
    subtotal: amount,
    orderTax: "0.00",
    orderTaxRate: "0.00",
    discount: "0.00",
    shipping: "0.00",
    grandTotal: amount,
    totalLabel: "Expense amount",
    items: [{
      name: expense.title,
      code: expense.expenseCategory.name,
      unitPrice: amount,
      quantity: "1",
      unit: "expense",
      discount: "0.00",
      discountType: "Fixed",
      taxType: "Exclusive",
      taxRate: "0.00",
      subtotal: amount,
    }],
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(expense.reference)}.pdf"`,
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
