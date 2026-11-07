import { z } from "zod";
import { requirePermission } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  buildPurchaseReportWhere,
  buildSaleReportWhere,
  buildStockReportWhere,
  buildWarehouseExpenseWhere,
  buildWarehousePurchaseReturnWhere,
  buildWarehouseSaleReturnWhere,
  buildWarehouseSaleWhere,
  warehouseReportTabs,
  type WarehouseReportTab,
} from "@/lib/reports/filters";
import { createReportXlsx, type ReportCell, type ReportColumn } from "@/lib/reports/xlsx";
import { PERMISSION } from "@/lib/permissions";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const exportSchema = z.object({
  report: z.enum(["warehouse", "sale", "purchase", "stock"]),
  q: z.string().trim().max(120).optional().default(""),
  date: dateSchema.optional(),
  warehouseId: z.string().max(100).optional(),
  tab: z.enum(warehouseReportTabs).optional().default("sales"),
});

type ExportData = {
  filename: string;
  sheetName: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
};

export async function GET(request: Request) {
  const access = await requirePermission(PERMISSION.manageReports);
  if (access.status === "unauthenticated") {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  if (access.status === "forbidden") {
    return Response.json({ error: "You do not have permission to export reports." }, { status: 403 });
  }

  const url = new URL(request.url);
  for (const key of ["report", "q", "date", "warehouseId", "tab"]) {
    if (url.searchParams.getAll(key).length > 1) {
      return Response.json({ error: `Provide only one ${key} value.` }, { status: 400 });
    }
  }

  const parsed = exportSchema.safeParse({
    report: url.searchParams.get("report"),
    q: url.searchParams.get("q") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
    warehouseId: url.searchParams.get("warehouseId") ?? undefined,
    tab: url.searchParams.get("tab") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid report export filters." }, { status: 400 });
  }

  const warehouseId = parsed.data.warehouseId
    ? (await db.warehouse.findFirst({
        where: { id: parsed.data.warehouseId, deletedAt: null },
        select: { id: true },
      }))?.id
    : undefined;
  const data = await getExportData({
    ...parsed.data,
    warehouseId,
    date: parsed.data.date ?? "",
  });
  const buffer = await createReportXlsx(data.sheetName, data.columns, data.rows);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${data.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function getExportData(filters: {
  report: "warehouse" | "sale" | "purchase" | "stock";
  q: string;
  date: string;
  warehouseId?: string;
  tab: WarehouseReportTab;
}): Promise<ExportData> {
  if (filters.report === "sale") {
    const sales = await db.sale.findMany({
      where: buildSaleReportWhere(filters.q, filters.date),
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        reference: true,
        status: true,
        grandTotal: true,
        paid: true,
        paymentStatus: true,
        customer: { select: { name: true } },
      },
    });
    return {
      filename: "sale-report.xlsx",
      sheetName: "Sales",
      columns: [
        { header: "Reference", width: 20 },
        { header: "Customer", width: 28 },
        { header: "Status", width: 16 },
        { header: "Grand Total", width: 18, numberFormat: '"$"#,##0.00' },
        { header: "Paid", width: 18, numberFormat: '"$"#,##0.00' },
        { header: "Payment Status", width: 18 },
      ],
      rows: sales.map((sale) => [
        sale.reference,
        sale.customer.name,
        sale.status,
        sale.grandTotal.toNumber(),
        sale.paid.toNumber(),
        sale.paymentStatus,
      ]),
    };
  }

  if (filters.report === "purchase") {
    const purchases = await db.purchase.findMany({
      where: buildPurchaseReportWhere(filters.q, filters.date),
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        reference: true,
        status: true,
        grandTotal: true,
        paymentType: true,
        createdAt: true,
        supplier: { select: { name: true } },
      },
    });
    return {
      filename: "purchase-report.xlsx",
      sheetName: "Purchases",
      columns: [
        { header: "Reference", width: 20 },
        { header: "Supplier", width: 28 },
        { header: "Status", width: 16 },
        { header: "Grand Total", width: 18, numberFormat: '"$"#,##0.00' },
        { header: "Paid", width: 16 },
        { header: "Due", width: 16 },
        { header: "Payment Type", width: 18 },
        { header: "Created On", width: 22, numberFormat: "yyyy-mm-dd hh:mm" },
      ],
      rows: purchases.map((purchase) => [
        purchase.reference,
        purchase.supplier.name,
        purchase.status,
        purchase.grandTotal.toNumber(),
        "—",
        "—",
        purchase.paymentType,
        purchase.createdAt,
      ]),
    };
  }

  if (filters.report === "stock") {
    const productWhere = buildStockReportWhere(filters.q);
    const [products, stockTotals] = await Promise.all([
      db.product.findMany({
        where: productWhere,
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          purchasePrice: true,
          price: true,
          productUnit: true,
          categoryRecord: { select: { name: true } },
        },
      }),
      db.productStock.groupBy({
        by: ["productId"],
        where: {
          warehouse: {
            is: {
              deletedAt: null,
              ...(filters.warehouseId ? { id: filters.warehouseId } : {}),
            },
          },
          product: {
            is: {
              deletedAt: null,
              categoryRecord: { is: { deletedAt: null } },
            },
          },
        },
        _sum: { quantity: true },
      }),
    ]);
    const stockByProduct = new Map(
      stockTotals.map(({ productId, _sum }) => [productId, _sum.quantity?.toNumber() ?? 0]),
    );
    return {
      filename: "stock-report.xlsx",
      sheetName: "Stock",
      columns: [
        { header: "Code", width: 18 },
        { header: "Name", width: 32 },
        { header: "Category", width: 24 },
        { header: "Cost", width: 16, numberFormat: '"$"#,##0.00' },
        { header: "Price", width: 16, numberFormat: '"$"#,##0.00' },
        { header: "Current Stock", width: 18, numberFormat: "0.000" },
      ],
      rows: products.map((product) => [
        product.code,
        product.name,
        product.categoryRecord.name,
        product.purchasePrice.toNumber(),
        product.price.toNumber(),
        stockByProduct.get(product.id) ?? 0,
      ]),
    };
  }

  return exportWarehouseReport(filters.q, filters.warehouseId, filters.tab);
}

async function exportWarehouseReport(
  query: string,
  warehouseId: string | undefined,
  tab: WarehouseReportTab,
): Promise<ExportData> {
  if (tab === "sales") {
    const rows = await db.sale.findMany({
      where: buildWarehouseSaleWhere(query, warehouseId),
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        reference: true,
        status: true,
        grandTotal: true,
        paid: true,
        due: true,
        paymentStatus: true,
        customer: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    return {
      filename: "warehouse-sales-report.xlsx",
      sheetName: "Sales",
      columns: salesColumns,
      rows: rows.map((row) => [
        row.reference, row.customer.name, row.warehouse.name, row.status,
        row.grandTotal.toNumber(), row.paid.toNumber(), row.due.toNumber(), row.paymentStatus,
      ]),
    };
  }

  if (tab === "sales-returns") {
    const rows = await db.saleReturn.findMany({
      where: buildWarehouseSaleReturnWhere(query, warehouseId),
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        reference: true,
        status: true,
        grandTotal: true,
        paid: true,
        due: true,
        paymentStatus: true,
        customer: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    return {
      filename: "warehouse-sales-returns-report.xlsx",
      sheetName: "Sales Returns",
      columns: salesColumns,
      rows: rows.map((row) => [
        row.reference, row.customer.name, row.warehouse.name, row.status,
        row.grandTotal.toNumber(), row.paid.toNumber(), row.due.toNumber(), row.paymentStatus,
      ]),
    };
  }

  if (tab === "purchase-returns") {
    const rows = await db.purchaseReturn.findMany({
      where: buildWarehousePurchaseReturnWhere(query, warehouseId),
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        reference: true,
        status: true,
        grandTotal: true,
        paid: true,
        due: true,
        paymentType: true,
        supplier: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    return {
      filename: "warehouse-purchase-returns-report.xlsx",
      sheetName: "Purchase Returns",
      columns: [
        { header: "Reference", width: 20 },
        { header: "Supplier", width: 28 },
        { header: "Warehouse", width: 24 },
        { header: "Status", width: 16 },
        { header: "Grand Total", width: 18, numberFormat: '"$"#,##0.00' },
        { header: "Paid", width: 18, numberFormat: '"$"#,##0.00' },
        { header: "Due", width: 18, numberFormat: '"$"#,##0.00' },
        { header: "Payment Type", width: 18 },
      ],
      rows: rows.map((row) => [
        row.reference, row.supplier.name, row.warehouse.name, row.status,
        row.grandTotal.toNumber(), row.paid.toNumber(), row.due.toNumber(), row.paymentType,
      ]),
    };
  }

  const rows = await db.expense.findMany({
    where: buildWarehouseExpenseWhere(query, warehouseId),
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      reference: true,
      title: true,
      amount: true,
      date: true,
      expenseCategory: { select: { name: true } },
      warehouse: { select: { name: true } },
    },
  });
  return {
    filename: "warehouse-expenses-report.xlsx",
    sheetName: "Expenses",
    columns: [
      { header: "Reference", width: 20 },
      { header: "Expense", width: 36 },
      { header: "Warehouse", width: 24 },
      { header: "Date", width: 16, numberFormat: "yyyy-mm-dd" },
      { header: "Amount", width: 18, numberFormat: '"$"#,##0.00' },
    ],
    rows: rows.map((row) => [
      row.reference,
      `${row.title} · ${row.expenseCategory.name}`,
      row.warehouse.name,
      row.date,
      row.amount.toNumber(),
    ]),
  };
}

const salesColumns: ReportColumn[] = [
  { header: "Reference", width: 20 },
  { header: "Customer", width: 28 },
  { header: "Warehouse", width: 24 },
  { header: "Status", width: 16 },
  { header: "Grand Total", width: 18, numberFormat: '"$"#,##0.00' },
  { header: "Paid", width: 18, numberFormat: '"$"#,##0.00' },
  { header: "Due", width: 18, numberFormat: '"$"#,##0.00' },
  { header: "Payment Status", width: 18 },
];
