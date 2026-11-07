import Link from "next/link";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShoppingBag,
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { z } from "zod";
import { connection } from "next/server";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import ExcelExportLink from "../ExcelExportLink";
import ReportPageSuspense from "../ReportPageSuspense";
import {
  buildWarehouseExpenseWhere,
  buildWarehousePurchaseReturnWhere,
  buildWarehouseSaleReturnWhere,
  buildWarehouseSaleWhere,
} from "@/lib/reports/filters";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

export const metadata: Metadata = {
  title: "Warehouse Reports",
  description: "Warehouse sales, purchases, returns, and expense reports.",
};

const tabSchema = z.enum(["sales", "sales-returns", "purchase-returns", "expenses"]);
const querySchema = z.string().trim().max(120);
const warehouseIdSchema = z.string().max(100);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const pageSizeOptions = [10, 25, 50] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ReportTab = z.infer<typeof tabSchema>;
type ReportRow = {
  id: string;
  reference: string;
  name: string;
  warehouse: string;
  status: string;
  grandTotal: string;
  paid: string;
  due: string;
  paymentType: string;
  paymentStatus: string;
};

const reportTabs: { id: ReportTab; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "sales-returns", label: "Sales Returns" },
  { id: "purchase-returns", label: "Purchases Returns" },
  { id: "expenses", label: "Expenses" },
];

export default function WarehouseReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <ReportPageSuspense>
      <WarehouseReportContent searchParams={searchParams} />
    </ReportPageSuspense>
  );
}

async function WarehouseReportContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await connection();
  const parsedTab = tabSchema.safeParse(params.tab);
  const tab = parsedTab.success ? parsedTab.data : "sales";
  const parsedQuery = querySchema.safeParse(params.q);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const parsedPage = pageSchema.safeParse(params.page);
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const parsedPageSize = pageSizeSchema.safeParse(params.pageSize);
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const parsedWarehouseId = warehouseIdSchema.safeParse(params.warehouseId);

  const warehouses = await db.warehouse.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const requestedWarehouse = parsedWarehouseId.success ? parsedWarehouseId.data : "";
  const selectedWarehouse = warehouses.find(({ id }) => id === requestedWarehouse);
  const warehouseId = selectedWarehouse?.id;

  const warehouseWhere = warehouseId ? { warehouseId } : {};
  const [salesCount, purchasesCount, salesReturnCount, purchaseReturnCount] = await Promise.all([
    db.sale.count({ where: { deletedAt: null, ...warehouseWhere } }),
    db.purchase.count({ where: { deletedAt: null, ...warehouseWhere } }),
    db.saleReturn.count({ where: { deletedAt: null, ...warehouseWhere } }),
    db.purchaseReturn.count({ where: { deletedAt: null, ...warehouseWhere } }),
  ]);

  let totalCount = 0;
  let requestedRows: ReportRow[] = [];

  if (tab === "sales") {
    const where = buildWarehouseSaleWhere(query, warehouseId);
    const [count, rows] = await Promise.all([
      db.sale.count({ where }),
      db.sale.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (requestedPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          grandTotal: true,
          paid: true,
          due: true,
          paymentStatus: true,
          customer: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);
    totalCount = count;
    requestedRows = rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      name: row.customer.name,
      warehouse: row.warehouse.name,
      status: row.status,
      grandTotal: row.grandTotal.toFixed(2),
      paid: row.paid.toFixed(2),
      due: row.due.toFixed(2),
      paymentType: "",
      paymentStatus: row.paymentStatus,
    }));
  } else if (tab === "sales-returns") {
    const where = buildWarehouseSaleReturnWhere(query, warehouseId);
    const [count, rows] = await Promise.all([
      db.saleReturn.count({ where }),
      db.saleReturn.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (requestedPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          grandTotal: true,
          paid: true,
          due: true,
          paymentStatus: true,
          customer: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);
    totalCount = count;
    requestedRows = rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      name: row.customer.name,
      warehouse: row.warehouse.name,
      status: row.status,
      grandTotal: row.grandTotal.toFixed(2),
      paid: row.paid.toFixed(2),
      due: row.due.toFixed(2),
      paymentType: "",
      paymentStatus: row.paymentStatus,
    }));
  } else if (tab === "purchase-returns") {
    const where = buildWarehousePurchaseReturnWhere(query, warehouseId);
    const [count, rows] = await Promise.all([
      db.purchaseReturn.count({ where }),
      db.purchaseReturn.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (requestedPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          grandTotal: true,
          paid: true,
          due: true,
          paymentType: true,
          supplier: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);
    totalCount = count;
    requestedRows = rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      name: row.supplier.name,
      warehouse: row.warehouse.name,
      status: row.status,
      grandTotal: row.grandTotal.toFixed(2),
      paid: row.paid.toFixed(2),
      due: row.due.toFixed(2),
      paymentType: row.paymentType,
      paymentStatus: "",
    }));
  } else {
    const where = buildWarehouseExpenseWhere(query, warehouseId);
    const [count, rows] = await Promise.all([
      db.expense.count({ where }),
      db.expense.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (requestedPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          title: true,
          amount: true,
          date: true,
          expenseCategory: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);
    totalCount = count;
    requestedRows = rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      name: `${row.title} · ${row.expenseCategory.name}`,
      warehouse: row.warehouse.name,
      status: row.date.toISOString().slice(0, 10),
      grandTotal: row.amount.toFixed(2),
      paid: "",
      due: "",
      paymentType: "",
      paymentStatus: "",
    }));
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const rows = currentPage === requestedPage
    ? requestedRows
    : await fetchPage(tab, { warehouseId, query, page: currentPage, pageSize });
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const baseParams = { tab, warehouseId, query, pageSize };

  return (
    <main className="gg-content reports-content">
      <form className="wh-filter warehouse-report-warehouse-filter" action="/reports/warehouse">
        <label htmlFor="warehouse-filter">Warehouse :</label>
        <select
          className="gg-select"
          id="warehouse-filter"
          name="warehouseId"
          defaultValue={warehouseId ?? ""}
        >
          <option value="">All Warehouse</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
          ))}
        </select>
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="pageSize" value={pageSize} />
        {query && <input type="hidden" name="q" value={query} />}
        <button className="btn-icon-gold wh-filter-submit" type="submit" aria-label="Apply warehouse filter">
          <Filter aria-hidden="true" />
        </button>
      </form>

      <section className="gg-kpi-grid warehouse-report-kpis" aria-label="Document counts">
        <CountKpi label="Sales" count={salesCount} tone="violet" icon={<ShoppingCart aria-hidden="true" />} />
        <CountKpi label="Purchases" count={purchasesCount} tone="emerald" icon={<ShoppingBag aria-hidden="true" />} />
        <CountKpi label="Sales Return" count={salesReturnCount} tone="blue" icon={<ArrowRight aria-hidden="true" />} />
        <CountKpi label="Purchases Return" count={purchaseReturnCount} tone="orange" icon={<ArrowLeft aria-hidden="true" />} />
      </section>

      <nav className="rpt-subtabs" aria-label="Warehouse report type">
        {reportTabs.map(({ id, label }) => (
          <Link
            aria-current={tab === id ? "page" : undefined}
            className={`rpt-subtab ${tab === id ? "is-active" : ""}`}
            href={buildHref("/reports/warehouse", { ...baseParams, tab: id, page: undefined })}
            key={id}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="rpt-toolbar warehouse-report-toolbar">
        <div className="report-toolbar-controls">
          <AutoSearchForm
            action="/reports/warehouse"
            className="rpt-search"
            id="warehouse-report-search"
            label="Search warehouse report"
            value={query}
            iconClassName="gg-input-icon"
          />
          <div className="report-toolbar-export">
            <ExcelExportLink report="warehouse" query={query} warehouseId={warehouseId} tab={tab} />
          </div>
        </div>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table warehouse-report-table">
            <ReportTableHead tab={tab} />
            <tbody>
              {rows.map((row) => <ReportTableRow key={row.id} row={row} tab={tab} />)}
              {rows.length === 0 && (
                <tr><td className="warehouse-empty-cell gg-muted" colSpan={tab === "sales" || tab === "sales-returns" ? 8 : tab === "purchase-returns" ? 8 : 5}>
                  {query ? "No records match your search." : "No records to display."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="gg-pagination">
          <form className="gg-perpage" action="/reports/warehouse">
            <label className="gg-muted" htmlFor="warehouse-report-page-size">Records per page</label>
            <select
              className="gg-select"
              id="warehouse-report-page-size"
              name="pageSize"
              defaultValue={String(pageSize)}
            >
              {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <input type="hidden" name="tab" value={tab} />
            {warehouseId && <input type="hidden" name="warehouseId" value={warehouseId} />}
            {query && <input type="hidden" name="q" value={query} />}
            <button className="gg-page-btn warehouse-page-size-submit" type="submit" aria-label="Apply page size">
              <ChevronRight aria-hidden="true" />
            </button>
          </form>
          <span className="gg-muted gg-num" aria-live="polite">{firstRecord}–{lastRecord} of {totalCount}</span>
          <div className="gg-spacer" />
          <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} params={baseParams} label="First page">
            <ChevronFirst aria-hidden="true" />
          </PaginationLink>
          <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} params={baseParams} label="Previous page">
            <ChevronLeft aria-hidden="true" />
          </PaginationLink>
          <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} params={baseParams} label="Next page">
            <ChevronRight aria-hidden="true" />
          </PaginationLink>
          <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} params={baseParams} label="Last page">
            <ChevronLast aria-hidden="true" />
          </PaginationLink>
        </div>
      </div>
    </main>
  );
}

function ReportTableHead({ tab }: { tab: ReportTab }) {
  if (tab === "sales" || tab === "sales-returns") {
    return (
      <thead><tr>
        <th>Reference</th><th>Customer</th><th>Warehouse</th><th>Status</th>
        <th>Grand Total</th><th>Paid</th><th>Due</th><th>Payment Status</th>
      </tr></thead>
    );
  }

  if (tab === "purchase-returns") {
    return (
      <thead><tr>
        <th>Reference</th><th>Supplier</th><th>Warehouse</th><th>Status</th>
        <th>Grand Total</th><th>Paid</th><th>Due</th><th>Payment Type</th>
      </tr></thead>
    );
  }

  return (
    <thead><tr>
      <th>Reference</th><th>Expense</th><th>Warehouse</th><th>Date</th><th>Amount</th>
    </tr></thead>
  );
}

function ReportTableRow({ row, tab }: { row: ReportRow; tab: ReportTab }) {
  if (tab === "expenses") {
    return (
      <tr>
        <td><span className="gg-chip-code">{row.reference}</span></td>
        <td>{row.name}</td>
        <td>{row.warehouse}</td>
        <td>{row.status}</td>
        <td className="gg-num gg-td-strong">$ {row.grandTotal}</td>
      </tr>
    );
  }

  const statusClass = row.status === "Received" ? "gg-badge--success" : "gg-badge--warning";
  return (
    <tr>
      <td><span className="gg-chip-code">{row.reference}</span></td>
      <td>{row.name}</td>
      <td>{row.warehouse}</td>
      <td><span className={`gg-badge ${statusClass}`}>{row.status}</span></td>
      <td className="gg-num gg-td-strong">$ {row.grandTotal}</td>
      <td className="gg-num">$ {row.paid}</td>
      <td className="gg-num">$ {row.due}</td>
      {tab === "purchase-returns" ? (
        <td>{row.paymentType}</td>
      ) : (
        <td>
          <span className={`gg-badge ${row.paymentStatus === "Paid" ? "gg-badge--success" : "gg-badge--warning"}`}>
            {row.paymentStatus}
          </span>
        </td>
      )}
    </tr>
  );
}

function CountKpi({
  label,
  count,
  tone,
  icon,
}: {
  label: string;
  count: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <article className={`gg-kpi gg-kpi--${tone}`}>
      <span className="gg-kpi-ico">{icon}</span>
      <span className="gg-kpi-body">
        <span className="gg-kpi-value gg-num">{count}</span>
        <span className="gg-kpi-label">{label}</span>
      </span>
    </article>
  );
}

function buildHref(
  pathname: string,
  params: { tab?: string; warehouseId?: string; query?: string; pageSize?: number; page?: number },
) {
  const queryParams = new URLSearchParams();
  if (params.tab) queryParams.set("tab", params.tab);
  if (params.warehouseId) queryParams.set("warehouseId", params.warehouseId);
  if (params.query) queryParams.set("q", params.query);
  if (params.pageSize && params.pageSize !== 10) queryParams.set("pageSize", String(params.pageSize));
  if (params.page && params.page > 1) queryParams.set("page", String(params.page));
  const search = queryParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function PaginationLink({
  page,
  currentPage,
  totalPages,
  params,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  params: { tab: ReportTab; warehouseId?: string; query: string; pageSize: number };
  label: string;
  children: React.ReactNode;
}) {
  const disabled = totalPages === 0 || page === currentPage;
  if (disabled) {
    return <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>;
  }
  return (
    <Link
      className="gg-page-btn"
      href={buildHref("/reports/warehouse", { ...params, page })}
      aria-label={label}
    >
      {children}
    </Link>
  );
}

async function fetchPage(
  tab: ReportTab,
  filters: { warehouseId?: string; query: string; page: number; pageSize: number },
): Promise<ReportRow[]> {
  const skip = (filters.page - 1) * filters.pageSize;

  if (tab === "sales") {
    const where = buildWarehouseSaleWhere(filters.query, filters.warehouseId);
    const items = await db.sale.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: filters.pageSize,
      select: {
        id: true, reference: true, status: true, grandTotal: true, paid: true, due: true, paymentStatus: true,
        customer: { select: { name: true } }, warehouse: { select: { name: true } },
      },
    });
    return items.map((item) => ({
      id: item.id, reference: item.reference, name: item.customer.name, warehouse: item.warehouse.name,
      status: item.status, grandTotal: item.grandTotal.toFixed(2), paid: item.paid.toFixed(2),
      due: item.due.toFixed(2), paymentType: "", paymentStatus: item.paymentStatus,
    }));
  }

  if (tab === "sales-returns") {
    const where = buildWarehouseSaleReturnWhere(filters.query, filters.warehouseId);
    const items = await db.saleReturn.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: filters.pageSize,
      select: {
        id: true, reference: true, status: true, grandTotal: true, paid: true, due: true, paymentStatus: true,
        customer: { select: { name: true } }, warehouse: { select: { name: true } },
      },
    });
    return items.map((item) => ({
      id: item.id, reference: item.reference, name: item.customer.name, warehouse: item.warehouse.name,
      status: item.status, grandTotal: item.grandTotal.toFixed(2), paid: item.paid.toFixed(2),
      due: item.due.toFixed(2), paymentType: "", paymentStatus: item.paymentStatus,
    }));
  }

  if (tab === "purchase-returns") {
    const where = buildWarehousePurchaseReturnWhere(filters.query, filters.warehouseId);
    const items = await db.purchaseReturn.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: filters.pageSize,
      select: {
        id: true, reference: true, status: true, grandTotal: true, paid: true, due: true, paymentType: true,
        supplier: { select: { name: true } }, warehouse: { select: { name: true } },
      },
    });
    return items.map((item) => ({
      id: item.id, reference: item.reference, name: item.supplier.name, warehouse: item.warehouse.name,
      status: item.status, grandTotal: item.grandTotal.toFixed(2), paid: item.paid.toFixed(2),
      due: item.due.toFixed(2), paymentType: item.paymentType, paymentStatus: "",
    }));
  }

  const where = buildWarehouseExpenseWhere(filters.query, filters.warehouseId);
  const items = await db.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip,
    take: filters.pageSize,
    select: {
      id: true, reference: true, title: true, amount: true, date: true,
      expenseCategory: { select: { name: true } }, warehouse: { select: { name: true } },
    },
  });
  return items.map((item) => ({
    id: item.id, reference: item.reference, name: `${item.title} · ${item.expenseCategory.name}`,
    warehouse: item.warehouse.name, status: item.date.toISOString().slice(0, 10),
    grandTotal: item.amount.toFixed(2), paid: "", due: "", paymentType: "", paymentStatus: "",
  }));
}
