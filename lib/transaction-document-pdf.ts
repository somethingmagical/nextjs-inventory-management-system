import PDFDocument from "pdfkit";

export type TransactionDocumentPdfData = {
  businessName: string;
  documentType: "Sales Invoice" | "Purchase Bill" | "Credit Note" | "Debit Note" | "Expense Voucher";
  reference: string;
  date: string;
  createdOn: string;
  status: string;
  issuerLabel: string;
  issuerName: string;
  issuerDetails: string[];
  recipientLabel: string;
  recipientName: string;
  recipientDetails: string[];
  metadata: { label: string; value: string }[];
  relatedReference?: string;
  notes: string;
  subtotal: string;
  orderTax: string;
  orderTaxRate: string;
  discount: string;
  shipping: string;
  grandTotal: string;
  totalLabel: string;
  paid?: string;
  due?: string;
  paidLabel?: string;
  dueLabel?: string;
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
  payments?: {
    date: string;
    amount: string;
    paymentType: string;
    notes: string;
  }[];
};

const pageWidth = 595.28;
const left = 42;
const right = 553;
const contentWidth = right - left;
const footerY = 794;
const green = "#3d733a";
const greenDark = "#2f5e2e";
const ink = "#292723";
const muted = "#77746d";
const line = "#e7e4dc";
const soft = "#f4f3ef";

export async function generateTransactionDocumentPdf(
  input: TransactionDocumentPdfData,
): Promise<Buffer> {
  const data = sanitizeData(input);
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 42, bottom: 42, left, right: pageWidth - right },
    bufferPages: true,
    info: {
      Title: `${data.documentType} ${data.reference}`,
      Subject: `${data.documentType} details`,
    },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  drawHeader(document, data);
  const issuerBottom = drawParty(document, data.issuerLabel, data.issuerName, data.issuerDetails, left, 145);
  const recipientBottom = drawParty(document, data.recipientLabel, data.recipientName, data.recipientDetails, 312, 145);
  let y = Math.max(issuerBottom, recipientBottom) + 12;
  y = drawMetadata(document, data.metadata, y);
  y += 17;
  drawItemsHeader(document, y);
  y += 25;

  for (const [index, item] of data.items.entries()) {
    const discount = formatDiscount(item.discount, item.discountType);
    const itemHeight = document.font("Helvetica-Bold").fontSize(9.5)
      .heightOfString(item.name, { width: 193 });
    const rowHeight = Math.max(43, itemHeight + (discount ? 35 : 25));
    if (y + rowHeight > footerY - 28) {
      document.addPage();
      drawHeader(document, data, true);
      y = 124;
      drawItemsHeader(document, y);
      y += 25;
    }

    if (index % 2 === 1) document.rect(left, y, contentWidth, rowHeight).fill("#faf9f6");
    document.fillColor(ink).font("Helvetica-Bold").fontSize(9.5)
      .text(item.name, 54, y + 7, { width: 193 });
    document.fillColor(muted).font("Helvetica").fontSize(7.5)
      .text(item.code ? `SKU: ${item.code}` : "", 54, y + 21, { width: 193, height: 10, ellipsis: true });
    if (discount) {
      document.fillColor(muted).fontSize(7.5)
        .text(`Discount: ${discount}`, 54, y + 32, { width: 193, height: 10, ellipsis: true });
    }
    document.fillColor(ink).font("Helvetica").fontSize(8.5)
      .text(`${item.quantity} ${item.unit}`.trim(), 250, y + 11, { width: 42, align: "right" });
    document.text(`$ ${item.unitPrice}`, 292, y + 11, { width: 78, align: "right" });
    document.fillColor(muted).text(
      `${item.taxType === "Inclusive" ? "Incl. " : ""}${item.taxRate}%`,
      370,
      y + 11,
      { width: 48, align: "right" },
    );
    document.fillColor(ink).font("Helvetica-Bold")
      .text(`$ ${item.subtotal}`, 418, y + 11, { width: 135, align: "right" });
    document.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).strokeColor(line).stroke();
    y += rowHeight;
  }

  y += 16;
  if (y + 168 > footerY - 20) {
    document.addPage();
    drawHeader(document, data, true);
    y = 130;
  }

  const summaryY = y;
  drawPaymentAndNotes(document, data, left, summaryY);
  drawTotals(document, data, 330, summaryY);
  y = Math.max(summaryY + 105, document.y) + 12;

  if (data.notes && data.payments?.length) {
    if (y + 44 > footerY - 18) {
      document.addPage();
      drawHeader(document, data, true);
      y = 130;
    }
    document.fillColor(ink).font("Helvetica-Bold").fontSize(8.5).text("Notes", left, y);
    document.fillColor(muted).font("Helvetica").fontSize(8)
      .text(data.notes, left, y + 13, { width: contentWidth });
  } else if (data.notes && !data.payments?.length) {
    document.fillColor(ink).font("Helvetica-Bold").fontSize(8.5).text("Notes", 330, y);
    document.fillColor(muted).font("Helvetica").fontSize(8)
      .text(data.notes, 330, y + 13, { width: 223 });
  }

  const pageRange = document.bufferedPageRange();
  for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
    document.switchToPage(page);
    document.moveTo(left, footerY - 10).lineTo(right, footerY - 10).strokeColor(line).stroke();
    document.fillColor(muted).font("Helvetica").fontSize(7)
      .text(data.businessName, left, footerY, { width: 240, lineBreak: false });
    document.text(`Page ${page + 1} of ${pageRange.count}`, 440, footerY, {
      width: 113,
      align: "right",
      lineBreak: false,
    });
  }
  document.end();

  return output;
}

function drawHeader(document: PDFKit.PDFDocument, data: TransactionDocumentPdfData, continuation = false) {
  document.rect(0, 0, pageWidth, 9).fill(green);
  document.fillColor(greenDark).font("Helvetica-Bold").fontSize(16)
    .text(data.businessName, left, 35, { width: 260, height: 21, ellipsis: true });
  document.fillColor(green).fontSize(20).text(
    continuation ? `${data.documentType} - continued` : data.documentType,
    285,
    34,
    { width: 268, align: "right", height: 25, ellipsis: true },
  );
  document.fillColor(ink).fontSize(9.5).text(data.reference, 300, 65, {
    width: 253,
    align: "right",
    lineBreak: false,
  });
  document.fillColor(muted).font("Helvetica").fontSize(8.5).text(data.date, 300, 80, {
    width: 253,
    align: "right",
    lineBreak: false,
  });

  const statusColor = /^(paid|received|delivered|recorded)$/i.test(data.status)
    ? greenDark
    : "#805a17";
  document.fillColor(statusColor).font("Helvetica-Bold").fontSize(7.5).text(
    data.status.toUpperCase(),
    300,
    96,
    { width: 253, align: "right", lineBreak: false },
  );
  document.moveTo(left, 122).lineTo(right, 122).strokeColor(green).lineWidth(1.5).stroke();
}

function drawParty(
  document: PDFKit.PDFDocument,
  label: string,
  name: string,
  details: string[],
  x: number,
  y: number,
) {
  const width = x === left ? 235 : 241;
  document.fillColor(muted).font("Helvetica-Bold").fontSize(7.5)
    .text(label.toUpperCase(), x, y, { width });
  document.fillColor(ink).fontSize(10).text(name, x, y + 14, { width });
  const cleanDetails = details.filter(Boolean).join("\n");
  document.fillColor(muted).font("Helvetica").fontSize(8)
    .text(cleanDetails, x, y + 30, { width });
  return y + 30 + document.heightOfString(cleanDetails, { width });
}

function drawMetadata(
  document: PDFKit.PDFDocument,
  metadata: TransactionDocumentPdfData["metadata"],
  y: number,
) {
  const height = 37;
  document.rect(left, y, contentWidth, height).fill(soft);
  const cellWidth = contentWidth / Math.max(metadata.length, 1);
  metadata.forEach(({ label, value }, index) => {
    const x = left + index * cellWidth + 10;
    document.fillColor(muted).font("Helvetica-Bold").fontSize(6.7)
      .text(label.toUpperCase(), x, y + 6, { width: cellWidth - 18, height: 9, ellipsis: true });
    document.fillColor(ink).font("Helvetica-Bold").fontSize(8)
      .text(value || "-", x, y + 19, { width: cellWidth - 18, height: 10, ellipsis: true });
  });
  return y + height;
}

function drawItemsHeader(document: PDFKit.PDFDocument, y: number) {
  document.rect(left, y, contentWidth, 24).fill(greenDark);
  const headers = [
    { label: "Item", x: 54, width: 193, align: "left" as const },
    { label: "Qty", x: 250, width: 42, align: "right" as const },
    { label: "Unit price", x: 292, width: 78, align: "right" as const },
    { label: "Tax", x: 370, width: 48, align: "right" as const },
    { label: "Amount", x: 418, width: 135, align: "right" as const },
  ];
  for (const header of headers) {
    document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7)
      .text(header.label.toUpperCase(), header.x, y + 8, {
        width: header.width,
        align: header.align,
        lineBreak: false,
      });
  }
}

function drawPaymentAndNotes(
  document: PDFKit.PDFDocument,
  data: TransactionDocumentPdfData,
  x: number,
  y: number,
) {
  const width = 242;
  const payments = data.payments ?? [];
  if (payments.length) {
    document.rect(x, y, width, 18 + Math.min(payments.length, 5) * 30).fill("#f8faf6");
    document.fillColor(greenDark).font("Helvetica-Bold").fontSize(8)
      .text("PAYMENT HISTORY", x + 12, y + 9, { width: width - 24 });
    payments.slice(0, 5).forEach((payment, index) => {
      const paymentY = y + 26 + index * 30;
      document.fillColor(ink).font("Helvetica").fontSize(7.5)
        .text(`${payment.date} · ${payment.paymentType}`, x + 12, paymentY, {
          width: 140,
          height: 10,
          ellipsis: true,
        });
      document.font("Helvetica-Bold").text(`$ ${payment.amount}`, x + 150, paymentY, {
        width: width - 162,
        align: "right",
        lineBreak: false,
      });
      if (payment.notes) {
        document.fillColor(muted).font("Helvetica").fontSize(7)
          .text(payment.notes, x + 12, paymentY + 11, { width: width - 24, height: 9, ellipsis: true });
      }
    });
    return;
  }

  document.rect(x, y, width, 54).fill("#f8faf6");
  document.fillColor(greenDark).font("Helvetica-Bold").fontSize(8)
    .text(data.documentType === "Expense Voucher" ? "EXPENSE RECORD" : "PAYMENT DETAILS", x + 12, y + 9, {
      width: width - 24,
    });
  const summary = data.documentType === "Expense Voucher"
    ? "Supporting details are listed with this voucher."
    : data.metadata.find((entry) => entry.label.toLowerCase().includes("payment"))?.value
      ?? "Refer to the payment status above.";
  document.fillColor(muted).font("Helvetica").fontSize(7.5)
    .text(summary, x + 12, y + 24, { width: width - 24, height: 22, ellipsis: true });
}

function drawTotals(
  document: PDFKit.PDFDocument,
  data: TransactionDocumentPdfData,
  x: number,
  y: number,
) {
  const rows = [
    ["Subtotal", `$ ${data.subtotal}`],
    ["Discount", `- $ ${data.discount}`],
    ["Shipping", `$ ${data.shipping}`],
    [`Tax (${data.orderTaxRate}%)`, `$ ${data.orderTax}`],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y + index * 17;
    document.fillColor(muted).font("Helvetica").fontSize(8).text(label, x, rowY, { width: 125 });
    document.fillColor(ink).font("Helvetica-Bold").fontSize(8)
      .text(value, x + 125, rowY, { width: 98, align: "right" });
  });

  let totalY = y + rows.length * 17 + 3;
  document.moveTo(x, totalY).lineTo(right, totalY).strokeColor(line).stroke();
  totalY += 10;
  document.fillColor(ink).font("Helvetica-Bold").fontSize(9)
    .text(data.totalLabel, x, totalY, { width: 125 });
  document.fillColor(greenDark).fontSize(11)
    .text(`$ ${data.grandTotal}`, x + 125, totalY - 1, { width: 98, align: "right" });
  totalY += 20;

  if (data.paid !== undefined) {
    drawBalanceRow(document, data.paidLabel ?? "Paid to date", `$ ${data.paid}`, x, totalY);
    totalY += 16;
  }
  if (data.due !== undefined) {
    document.rect(x, totalY - 3, 223, 23).fill(soft);
    drawBalanceRow(document, data.dueLabel ?? "Balance due", `$ ${data.due}`, x + 8, totalY + 3, true);
  }
  document.y = totalY + (data.due !== undefined ? 22 : 0);
}

function drawBalanceRow(
  document: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  emphasized = false,
) {
  document.fillColor(emphasized ? ink : muted).font("Helvetica").fontSize(8)
    .text(label, x, y, { width: 120 });
  document.fillColor(emphasized ? greenDark : ink).font("Helvetica-Bold").fontSize(emphasized ? 9 : 8)
    .text(value, x + 120, y, { width: emphasized ? 87 : 103, align: "right" });
}

function formatDiscount(value: string, type: string) {
  if (!value || Number(value) === 0) return "";
  return type === "Percentage" ? `${value}%` : `$ ${value}`;
}

function sanitizeText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
}

function sanitizeData(data: TransactionDocumentPdfData): TransactionDocumentPdfData {
  const safe = sanitizeText;
  return {
    ...data,
    businessName: safe(data.businessName || "Warehouse"),
    reference: safe(data.reference),
    date: safe(data.date),
    createdOn: safe(data.createdOn),
    status: safe(data.status),
    issuerLabel: safe(data.issuerLabel),
    issuerName: safe(data.issuerName),
    issuerDetails: data.issuerDetails.map(safe),
    recipientLabel: safe(data.recipientLabel),
    recipientName: safe(data.recipientName),
    recipientDetails: data.recipientDetails.map(safe),
    metadata: data.metadata.map(({ label, value }) => ({ label: safe(label), value: safe(value) })),
    relatedReference: data.relatedReference ? safe(data.relatedReference) : undefined,
    notes: safe(data.notes),
    subtotal: safe(data.subtotal),
    orderTax: safe(data.orderTax),
    orderTaxRate: safe(data.orderTaxRate),
    discount: safe(data.discount),
    shipping: safe(data.shipping),
    grandTotal: safe(data.grandTotal),
    totalLabel: safe(data.totalLabel),
    paid: data.paid === undefined ? undefined : safe(data.paid),
    due: data.due === undefined ? undefined : safe(data.due),
    paidLabel: data.paidLabel ? safe(data.paidLabel) : undefined,
    dueLabel: data.dueLabel ? safe(data.dueLabel) : undefined,
    items: data.items.map((item) => ({
      ...item,
      name: safe(item.name),
      code: safe(item.code),
      unitPrice: safe(item.unitPrice),
      quantity: safe(item.quantity),
      unit: safe(item.unit),
      discount: safe(item.discount),
      discountType: safe(item.discountType),
      taxType: safe(item.taxType),
      taxRate: safe(item.taxRate),
      subtotal: safe(item.subtotal),
    })),
    payments: data.payments?.map((payment) => ({
      date: safe(payment.date),
      amount: safe(payment.amount),
      paymentType: safe(payment.paymentType),
      notes: safe(payment.notes),
    })),
  };
}
