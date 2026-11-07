import assert from "node:assert/strict";
import test from "node:test";
import { PDFParse } from "pdf-parse";
import { generatePurchasePdf, type PurchasePdfData } from "./purchase-pdf";

const purchase: PurchasePdfData = {
  reference: "PU_TEST123",
  date: "Nov 7, 2026",
  createdOn: "Nov 7, 2026",
  status: "Received",
  supplier: "Sample Supplier",
  supplierAddress: "1 Main Street",
  supplierEmail: "supplier@example.test",
  supplierPhone: "555-0100",
  warehouse: "Main Warehouse",
  warehouseLocation: "Auckland",
  warehousePhone: "555-0101",
  paymentType: "Cash",
  paymentStatus: "Unpaid",
  notes: "Sample purchase",
  orderTax: "1.25",
  orderTaxRate: "5.00",
  discount: "2.00",
  shipping: "3.50",
  grandTotal: "31.50",
  items: [{
    name: "Sample Product",
    code: "SP-1",
    unitCost: "12.50",
    quantity: "2",
    unit: "piece",
    discount: "1.00",
    discountType: "Fixed",
    taxType: "Exclusive",
    taxRate: "10.00",
    subtotal: "26.50",
  }],
};

test("generates a downloadable PDF for a purchase", async () => {
  const pdf = await generatePurchasePdf(purchase);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.toString("ascii").trimEnd().endsWith("%%EOF"));

  const parser = new PDFParse({ data: pdf });
  try {
    const result = await parser.getText();
    assert.match(result.text, /Sample Supplier/);
    assert.match(result.text, /Grand Total/);
    assert.match(result.text, /31\.50/);
  } finally {
    await parser.destroy();
  }
});

test("generates a purchase return PDF with payment balances", async () => {
  const pdf = await generatePurchasePdf({
    ...purchase,
    documentType: "Purchase Return",
    reference: "PR_TEST123",
    paid: "5.00",
    due: "26.50",
  });
  const parser = new PDFParse({ data: pdf });
  try {
    const result = await parser.getText();
    assert.match(result.text, /P U R C H A S E R E T U R N/);
    assert.match(result.text, /Return Items/);
    assert.match(result.text, /Paid/);
    assert.match(result.text, /Due/);
    assert.match(result.text, /PR_TEST123/);
  } finally {
    await parser.destroy();
  }
});

test("supports multiple pages and text outside Helvetica's character set", async () => {
  const pdf = await generatePurchasePdf({
    ...purchase,
    supplier: "Café supplies",
    items: Array.from({ length: 60 }, (_, index) => ({
      ...purchase.items[0],
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
