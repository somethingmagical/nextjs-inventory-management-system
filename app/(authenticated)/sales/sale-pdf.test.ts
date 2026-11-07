import assert from "node:assert/strict";
import test from "node:test";
import { PDFParse } from "pdf-parse";
import { generateSalePdf, type SalePdfData } from "./sale-pdf";

const sale: SalePdfData = {
  reference: "SA_TEST123",
  date: "Nov 7, 2026",
  createdOn: "Nov 7, 2026",
  status: "Received",
  customer: "Sample Customer",
  customerAddress: "1 Main Street",
  customerEmail: "customer@example.test",
  customerPhone: "555-0100",
  warehouse: "Main Warehouse",
  warehouseLocation: "Auckland",
  warehousePhone: "555-0101",
  paymentType: "Cash",
  paymentStatus: "Partial",
  paid: "10.00",
  due: "21.50",
  notes: "Sample sale",
  orderTax: "1.25",
  orderTaxRate: "5.00",
  discount: "2.00",
  shipping: "3.50",
  grandTotal: "31.50",
  items: [{
    name: "Sample Product",
    code: "SP-1",
    unitPrice: "12.50",
    quantity: "2",
    unit: "piece",
    discount: "1.00",
    discountType: "Fixed",
    taxType: "Exclusive",
    taxRate: "10.00",
    subtotal: "26.50",
  }],
  payments: [{
    date: "Nov 7, 2026",
    amount: "10.00",
    paymentType: "Cash",
    notes: "Deposit",
  }],
};

test("generates a sale PDF with items, totals, and payment history", async () => {
  const pdf = await generateSalePdf(sale);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.toString("ascii").trimEnd().endsWith("%%EOF"));

  const parser = new PDFParse({ data: pdf });
  try {
    const result = await parser.getText();
    assert.match(result.text, /Sample Customer/);
    assert.match(result.text, /Sample Product/);
    assert.match(result.text, /Net Unit Price|Unit Price/);
    assert.match(result.text, /Grand Total/);
    assert.match(result.text, /31\.50/);
    assert.match(result.text, /Payment History/);
    assert.match(result.text, /Deposit/);
    assert.match(result.text, /21\.50/);
  } finally {
    await parser.destroy();
  }
});

test("generates a sale return PDF with returned items and refund summary", async () => {
  const pdf = await generateSalePdf({
    ...sale,
    documentType: "Sale Return",
    relatedSaleReference: "SA_ORIGINAL",
    reference: "SR_TEST123",
    paymentType: "",
    paymentStatus: "Unpaid",
    paid: "0.00",
    due: "31.50",
    payments: [],
  });
  const parser = new PDFParse({ data: pdf });
  try {
    const result = await parser.getText();
    assert.match(result.text, /S A L E R E T U R N/);
    assert.match(result.text, /SR_TEST123/);
    assert.match(result.text, /SA_ORIGINAL/);
    assert.match(result.text, /Returned Items/);
    assert.match(result.text, /Refund Summary/);
    assert.match(result.text, /REFUND STATUS/);
    assert.match(result.text, /Refunded/);
    assert.match(result.text, /Refund Due/);
    assert.doesNotMatch(result.text, /Payment History/);
  } finally {
    await parser.destroy();
  }
});

test("supports multiple pages and sanitizes unsupported text", async () => {
  const pdf = await generateSalePdf({
    ...sale,
    customer: "Café customer",
    items: Array.from({ length: 60 }, (_, index) => ({
      ...sale.items[0],
      name: `Product ${index + 1}`,
    })),
  });
  const parser = new PDFParse({ data: pdf });
  let pageCount = 0;
  try {
    pageCount = (await parser.getText()).pages.length;
  } finally {
    await parser.destroy();
  }

  assert.ok(pageCount > 1);
});
