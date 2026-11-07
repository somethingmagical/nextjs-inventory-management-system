import PDFDocument from "pdfkit";

export type SalePdfData = {
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

const ink = "#292723";
const muted = "#74716b";
const gold = "#b38336";
const light = "#e9e6df";
const pageBottom = 765;

export async function generateSalePdf(sale: SalePdfData): Promise<Buffer> {
  const data = sanitizeSaleData(sale);
  const documentType = data.documentType ?? "Sale";
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 56, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: `${documentType} ${data.reference}`,
      Subject: `${documentType} details and ${documentType === "Sale Return" ? "refund" : "payment"} summary`,
    },
  });
  const chunks: Buffer[] = [];

  const output = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.fillColor(gold).font("Helvetica-Bold").fontSize(10).text(documentType.toUpperCase(), 48, 48, {
    characterSpacing: 1.4,
  });
  document.fillColor(ink).fontSize(24).text(data.reference, 48, 67, { width: 360 });
  document.fillColor(muted).font("Helvetica").fontSize(10).text(data.date, 48, 98);
  document
    .fillColor(data.status === "Received" ? "#237a52" : "#8a651c")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(data.status.toUpperCase(), 450, 76, { width: 96, align: "right" });
  document.moveTo(48, 121).lineTo(547, 121).strokeColor(light).stroke();

  let leftY = 139;
  leftY = drawLabelValue(document, "CUSTOMER", data.customer, 48, leftY, 238);
  leftY = drawLabelValue(document, "CUSTOMER ADDRESS", data.customerAddress, 48, leftY, 238);
  leftY = drawLabelValue(document, "CUSTOMER EMAIL", data.customerEmail, 48, leftY, 238);
  leftY = drawLabelValue(document, "CUSTOMER PHONE", data.customerPhone, 48, leftY, 238);
  leftY = drawLabelValue(document, "CREATED ON", data.createdOn, 48, leftY, 238);

  let rightY = 139;
  rightY = drawLabelValue(document, "WAREHOUSE", data.warehouse, 310, rightY, 236);
  rightY = drawLabelValue(document, "LOCATION", data.warehouseLocation, 310, rightY, 236);
  rightY = drawLabelValue(document, "WAREHOUSE PHONE", data.warehousePhone, 310, rightY, 236);
  if (documentType === "Sale") {
    rightY = drawLabelValue(document, "PAYMENT TYPE", data.paymentType, 310, rightY, 236);
    rightY = drawLabelValue(document, "PAYMENT STATUS", data.paymentStatus, 310, rightY, 236);
  } else {
    rightY = drawLabelValue(document, "REFUND STATUS", data.paymentStatus, 310, rightY, 236);
    if (data.relatedSaleReference) {
      rightY = drawLabelValue(document, "ORIGINAL SALE", data.relatedSaleReference, 310, rightY, 236);
    }
  }
  let y = Math.max(leftY, rightY) + 14;

  ensureRoom(document, y, 100, documentType);
  y = document.y;
  document.fillColor(ink).font("Helvetica-Bold").fontSize(13)
    .text(documentType === "Sale Return" ? "Returned Items" : "Order Items", 48, y);
  y += 25;

  for (const item of data.items) {
    document.font("Helvetica-Bold").fontSize(10);
    const nameHeight = document.heightOfString(item.name, { width: 485 });
    const blockHeight = nameHeight + 59;
    ensureRoom(document, y, blockHeight, documentType);
    y = document.y;

    document.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(item.name, 48, y, { width: 485 });
    y += nameHeight + 3;
    document.fillColor(muted).font("Helvetica").fontSize(8.5).text(`Code: ${item.code}`, 48, y, { width: 485 });
    y += 15;
    drawCompactValue(document, "Net Unit Price", `$ ${item.unitPrice}`, 48, y, 125);
    drawCompactValue(document, "Quantity", `${item.quantity} ${item.unit}`, 190, y, 130);
    drawCompactValue(document, "Subtotal", `$ ${item.subtotal}`, 426, y, 120, true);
    y += 26;
    const discount = item.discountType === "Percentage"
      ? `${item.discount}%`
      : `$ ${item.discount}`;
    document
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text(`Discount ${discount}     Tax ${item.taxType} ${item.taxRate}%`, 48, y, { width: 485 });
    y += 17;
    document.moveTo(48, y).lineTo(547, y).strokeColor(light).stroke();
    y += 12;
  }

  ensureRoom(document, y, 154, documentType);
  y = document.y;
  document.fillColor(ink).font("Helvetica-Bold").fontSize(12)
    .text(documentType === "Sale Return" ? "Refund Summary" : "Totals", 48, y);
  y += 22;
  y = drawTotal(document, `Order Tax (${data.orderTaxRate}%)`, `$ ${data.orderTax}`, y);
  y = drawTotal(document, "Discount", `$ ${data.discount}`, y);
  y = drawTotal(document, "Shipping", `$ ${data.shipping}`, y);
  y = drawTotal(document, "Grand Total", `$ ${data.grandTotal}`, y);
  y = drawTotal(document, documentType === "Sale Return" ? "Refunded" : "Paid", `$ ${data.paid}`, y);
  drawTotal(document, documentType === "Sale Return" ? "Refund Due" : "Due", `$ ${data.due}`, y);

  if (documentType === "Sale" && data.payments.length > 0) {
    let paymentsY = document.y + 16;
    ensureRoom(document, paymentsY, 56, documentType);
    paymentsY = document.y;
    document.fillColor(ink).font("Helvetica-Bold").fontSize(12).text("Payment History", 48, paymentsY);
    paymentsY += 22;

    for (const payment of data.payments) {
      document.font("Helvetica").fontSize(8.5);
      const notesHeight = payment.notes
        ? document.heightOfString(payment.notes, { width: 499 })
        : 0;
      const rowHeight = Math.max(17, notesHeight + 5);
      ensureRoom(document, paymentsY, rowHeight + 6, documentType);
      paymentsY = document.y;
      document.fillColor(ink).fontSize(8.5).text(
        `${payment.date}  ·  $ ${payment.amount}  ·  ${payment.paymentType}`,
        48,
        paymentsY,
        { width: 499 },
      );
      if (payment.notes) {
        document.fillColor(muted).fontSize(8).text(payment.notes, 48, paymentsY + 12, { width: 499 });
      }
      paymentsY += rowHeight + 5;
    }
    document.y = paymentsY;
  }

  if (data.notes) {
    const notesY = document.y + 14;
    ensureRoom(document, notesY, 64, documentType);
    y = document.y;
    document.fillColor(ink).font("Helvetica-Bold").fontSize(10).text("Notes", 48, y);
    y += 15;
    document.fillColor(muted).font("Helvetica").fontSize(9).text(data.notes, 48, y, { width: 499 });
  }

  const pageRange = document.bufferedPageRange();
  for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
    document.switchToPage(page);
    document.fillColor(muted).font("Helvetica").fontSize(8)
      .text(`Generated ${data.createdOn}`, 48, pageBottom, { width: 300, lineBreak: false });
    document.text(`Page ${page + 1} of ${pageRange.count}`, 440, pageBottom, {
      width: 107,
      align: "right",
      lineBreak: false,
    });
  }
  document.end();

  return output;
}

function drawLabelValue(
  document: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  document.fillColor(muted).font("Helvetica-Bold").fontSize(7.5).text(label, x, y, { width });
  const valueY = y + 11;
  document.fillColor(ink).font("Helvetica").fontSize(9)
    .text(value || "—", x, valueY, { width, height: 25, ellipsis: true });
  return valueY + 27;
}

function drawCompactValue(
  document: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  alignRight = false,
) {
  document.fillColor(muted).font("Helvetica").fontSize(8).text(label, x, y, { width: width / 2 });
  document.fillColor(ink).font("Helvetica-Bold").fontSize(8.5)
    .text(value, x + width / 2, y, { width: width / 2, align: alignRight ? "right" : "left" });
}

function drawTotal(document: PDFKit.PDFDocument, label: string, value: string, y: number) {
  document.fillColor(muted).font("Helvetica").fontSize(9).text(label, 330, y, { width: 105 });
  document.fillColor(ink).text(value, 435, y, { width: 112, align: "right" });
  return y + 18;
}

function ensureRoom(
  document: PDFKit.PDFDocument,
  y: number,
  height: number,
  documentType: "Sale" | "Sale Return",
) {
  if (y + height > pageBottom - 18) {
    document.addPage();
    document.fillColor(gold).font("Helvetica-Bold").fontSize(9).text(`${documentType.toUpperCase()} DETAILS`, 48, 48, {
      characterSpacing: 1.2,
    });
    document.fillColor(ink).fontSize(14).text(sanitizePdfText(String(document.info.Title ?? "Sale")), 48, 65);
    document.moveTo(48, 91).lineTo(547, 91).strokeColor(light).stroke();
    document.y = 107;
  } else {
    document.y = y;
  }
}

function sanitizePdfText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
}

function sanitizeSaleData(sale: SalePdfData): SalePdfData {
  const safe = (value: string) => sanitizePdfText(value);
  return {
    ...sale,
    documentType: sale.documentType,
    relatedSaleReference: sale.relatedSaleReference ? safe(sale.relatedSaleReference) : undefined,
    reference: safe(sale.reference),
    date: safe(sale.date),
    createdOn: safe(sale.createdOn),
    status: safe(sale.status),
    customer: safe(sale.customer),
    customerAddress: safe(sale.customerAddress),
    customerEmail: safe(sale.customerEmail),
    customerPhone: safe(sale.customerPhone),
    warehouse: safe(sale.warehouse),
    warehouseLocation: safe(sale.warehouseLocation),
    warehousePhone: safe(sale.warehousePhone),
    paymentType: safe(sale.paymentType),
    paymentStatus: safe(sale.paymentStatus),
    paid: safe(sale.paid),
    due: safe(sale.due),
    notes: safe(sale.notes),
    orderTax: safe(sale.orderTax),
    orderTaxRate: safe(sale.orderTaxRate),
    discount: safe(sale.discount),
    shipping: safe(sale.shipping),
    grandTotal: safe(sale.grandTotal),
    items: sale.items.map((item) => ({
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
    payments: sale.payments.map((payment) => ({
      date: safe(payment.date),
      amount: safe(payment.amount),
      paymentType: safe(payment.paymentType),
      notes: safe(payment.notes),
    })),
  };
}
