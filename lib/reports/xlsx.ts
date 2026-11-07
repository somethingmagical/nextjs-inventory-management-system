import "server-only";

import ExcelJS from "exceljs";

export type ReportCell = string | number | Date | null;
export type ReportColumn = {
  header: string;
  width: number;
  numberFormat?: string;
};

export async function createReportXlsx(
  sheetName: string,
  columns: ReportColumn[],
  rows: ReportCell[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventory";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = columns.map((column, index) => ({
    header: column.header,
    key: `column${index}`,
    width: column.width,
    style: column.numberFormat ? { numFmt: column.numberFormat } : undefined,
  }));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: columns.length },
  };

  const header = worksheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFB8860B" },
  };
  header.alignment = { vertical: "middle" };

  for (const row of rows) {
    worksheet.addRow(row);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
