import assert from "node:assert/strict";
import test from "node:test";
import { PDFParse } from "pdf-parse";
import { generateTransactionDocumentPdf } from "./transaction-document-pdf";

test("generates an expense voucher with its category, reference, and amount", async () => {
  const pdf = await generateTransactionDocumentPdf({
    businessName: "The Warehouse",
    documentType: "Expense Voucher",
    reference: "EX-2026-001",
    date: "Nov 25, 2026",
    createdOn: "Nov 25, 2026",
    status: "Recorded",
    issuerLabel: "Recorded by",
    issuerName: "The Warehouse",
    issuerDetails: ["Central Warehouse", "Auckland", "555-0101"],
    recipientLabel: "Expense",
    recipientName: "Cleaning supplies",
    recipientDetails: ["Maintenance"],
    metadata: [
      { label: "Expense date", value: "Nov 25, 2026" },
      { label: "Category", value: "Maintenance" },
      { label: "Warehouse", value: "Central Warehouse" },
      { label: "Recorded", value: "Nov 25, 2026" },
    ],
    notes: "Floor cleaning products",
    subtotal: "48.50",
    orderTax: "0.00",
    orderTaxRate: "0.00",
    discount: "0.00",
    shipping: "0.00",
    grandTotal: "48.50",
    totalLabel: "Expense amount",
    items: [{
      name: "Cleaning supplies",
      code: "Maintenance",
      unitPrice: "48.50",
      quantity: "1",
      unit: "expense",
      discount: "0.00",
      discountType: "Fixed",
      taxType: "Exclusive",
      taxRate: "0.00",
      subtotal: "48.50",
    }],
  });

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  const parser = new PDFParse({ data: pdf });
  try {
    const result = await parser.getText();
    assert.match(result.text, /EXPENSE VOUCHER/i);
    assert.match(result.text, /EX-2026-001/);
    assert.match(result.text, /Cleaning supplies/);
    assert.match(result.text, /Expense amount/);
    assert.match(result.text, /48\.50/);
  } finally {
    await parser.destroy();
  }
});
