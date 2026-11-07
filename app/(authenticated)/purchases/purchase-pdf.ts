import PDFDocument from "pdfkit";

export type PurchasePdfData = {
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

const ink = "#292723";
const muted = "#74716b";
const gold = "#b38336";
const light = "#e9e6df";
const pageBottom = 765;

export async function generatePurchasePdf(purchase: PurchasePdfData): Promise<Buffer> {
  const pdfPurchase = sanitizePurchaseData(purchase);
  const documentType = pdfPurchase.documentType ?? "Purchase";
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 56, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: `${documentType} ${pdfPurchase.reference}`,
      Subject: `${documentType} details`,
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
  document.fillColor(ink).fontSize(24).text(pdfPurchase.reference, 48, 67, { width: 360 });
  document.fillColor(muted).font("Helvetica").fontSize(10).text(pdfPurchase.date, 48, 98);
  document
    .fillColor(pdfPurchase.status === "Received" ? "#237a52" : "#8a651c")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(pdfPurchase.status.toUpperCase(), 450, 76, { width: 96, align: "right" });
  document.moveTo(48, 121).lineTo(547, 121).strokeColor(light).stroke();

  let leftY = 139;
  leftY = drawLabelValue(document, "SUPPLIER", pdfPurchase.supplier, 48, leftY, 238);
  leftY = drawLabelValue(document, "SUPPLIER ADDRESS", pdfPurchase.supplierAddress, 48, leftY, 238);
  leftY = drawLabelValue(document, "SUPPLIER EMAIL", pdfPurchase.supplierEmail, 48, leftY, 238);
  leftY = drawLabelValue(document, "SUPPLIER PHONE", pdfPurchase.supplierPhone, 48, leftY, 238);
  leftY = drawLabelValue(document, "CREATED ON", pdfPurchase.createdOn, 48, leftY, 238);

  let rightY = 139;
  rightY = drawLabelValue(document, "WAREHOUSE", pdfPurchase.warehouse, 310, rightY, 236);
  rightY = drawLabelValue(document, "LOCATION", pdfPurchase.warehouseLocation, 310, rightY, 236);
  rightY = drawLabelValue(document, "WAREHOUSE PHONE", pdfPurchase.warehousePhone, 310, rightY, 236);
  const paymentDetails = pdfPurchase.paid !== undefined && pdfPurchase.due !== undefined
    ? `${pdfPurchase.paymentType} · Paid $ ${pdfPurchase.paid} · Due $ ${pdfPurchase.due}`
    : `${pdfPurchase.paymentType} - ${pdfPurchase.paymentStatus}`;
  rightY = drawLabelValue(document, "PAYMENT", paymentDetails, 310, rightY, 236);
  let y = Math.max(leftY, rightY) + 14;

  ensureRoom(document, y, 110, documentType);
  y = document.y;
  document.fillColor(ink).font("Helvetica-Bold").fontSize(13)
    .text(documentType === "Purchase Return" ? "Return Items" : "Order Items", 48, y);
  y += 25;

  for (const item of pdfPurchase.items) {
    document.font("Helvetica-Bold").fontSize(10);
    const nameHeight = document.heightOfString(item.name, { width: 485 });
    const blockHeight = nameHeight + 59;
    ensureRoom(document, y, blockHeight, documentType);
    y = document.y;

    document.fillColor(ink).font("Helvetica-Bold").fontSize(10).text(item.name, 48, y, { width: 485 });
    y += nameHeight + 3;
    document.fillColor(muted).font("Helvetica").fontSize(8.5).text(`Code: ${item.code}`, 48, y, { width: 485 });
    y += 15;
    drawCompactValue(document, "Unit Cost", `$ ${item.unitCost}`, 48, y, 104);
    drawCompactValue(document, "Quantity", `${item.quantity} ${item.unit}`, 177, y, 125);
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

  ensureRoom(document, y, pdfPurchase.paid !== undefined ? 176 : 136, documentType);
  y = document.y;
  document.moveTo(330, y).lineTo(547, y).strokeColor(light).stroke();
  y += 13;
  y = drawTotal(document, `Order Tax (${pdfPurchase.orderTaxRate}%)`, `$ ${pdfPurchase.orderTax}`, y);
  y = drawTotal(document, "Discount", `$ ${pdfPurchase.discount}`, y);
  y = drawTotal(document, "Shipping", `$ ${pdfPurchase.shipping}`, y);
  if (pdfPurchase.paid !== undefined && pdfPurchase.due !== undefined) {
    y = drawTotal(document, "Paid", `$ ${pdfPurchase.paid}`, y);
    y = drawTotal(document, "Due", `$ ${pdfPurchase.due}`, y);
  }
  document.fillColor(ink).font("Helvetica-Bold").fontSize(13);
  document.text("Grand Total", 330, y + 4, { width: 105 });
  document.text(`$ ${pdfPurchase.grandTotal}`, 435, y + 4, { width: 112, align: "right" });

  if (pdfPurchase.notes) {
    y += 40;
    ensureRoom(document, y, 64, documentType);
    y = document.y;
    document.fillColor(ink).font("Helvetica-Bold").fontSize(10).text("Notes", 48, y);
    y += 15;
    document.fillColor(muted).font("Helvetica").fontSize(9).text(pdfPurchase.notes, 48, y, { width: 499 });
  }

  const pageRange = document.bufferedPageRange();
  for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
    document.switchToPage(page);
    document
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(8)
      .text(`Generated ${pdfPurchase.createdOn}`, 48, pageBottom, { width: 300, lineBreak: false });
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
  document
    .fillColor(ink)
    .font("Helvetica")
    .fontSize(9)
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
  document
    .fillColor(ink)
    .font("Helvetica-Bold")
    .fontSize(8.5)
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
  documentType: "Purchase" | "Purchase Return",
) {
  if (y + height > pageBottom - 18) {
    document.addPage();
    document.fillColor(gold).font("Helvetica-Bold").fontSize(9).text(`${documentType.toUpperCase()} DETAILS`, 48, 48, {
      characterSpacing: 1.2,
    });
    document.fillColor(ink).fontSize(14).text(sanitizePdfText(String(document.info.Title ?? "Purchase")), 48, 65);
    document.moveTo(48, 91).lineTo(547, 91).strokeColor(light).stroke();
    document.y = 107;
  } else {
    document.y = y;
  }
}

function sanitizePdfText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
}

function sanitizePurchaseData(purchase: PurchasePdfData): PurchasePdfData {
  const safe = (value: string) => sanitizePdfText(value);
  return {
    ...purchase,
    documentType: purchase.documentType,
    reference: safe(purchase.reference),
    date: safe(purchase.date),
    createdOn: safe(purchase.createdOn),
    status: safe(purchase.status),
    supplier: safe(purchase.supplier),
    supplierAddress: safe(purchase.supplierAddress),
    supplierEmail: safe(purchase.supplierEmail),
    supplierPhone: safe(purchase.supplierPhone),
    warehouse: safe(purchase.warehouse),
    warehouseLocation: safe(purchase.warehouseLocation),
    warehousePhone: safe(purchase.warehousePhone),
    paymentType: safe(purchase.paymentType),
    paymentStatus: safe(purchase.paymentStatus),
    ...(purchase.paid !== undefined ? { paid: safe(purchase.paid) } : {}),
    ...(purchase.due !== undefined ? { due: safe(purchase.due) } : {}),
    notes: safe(purchase.notes),
    orderTax: safe(purchase.orderTax),
    orderTaxRate: safe(purchase.orderTaxRate),
    discount: safe(purchase.discount),
    shipping: safe(purchase.shipping),
    grandTotal: safe(purchase.grandTotal),
    items: purchase.items.map((item) => ({
      ...item,
      name: safe(item.name),
      code: safe(item.code),
      unitCost: safe(item.unitCost),
      quantity: safe(item.quantity),
      unit: safe(item.unit),
      discount: safe(item.discount),
      discountType: safe(item.discountType),
      taxType: safe(item.taxType),
      taxRate: safe(item.taxRate),
      subtotal: safe(item.subtotal),
    })),
  };
}
