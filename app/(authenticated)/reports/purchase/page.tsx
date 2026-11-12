import Link from "next/link";
import {
  CalendarDays,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { connection } from "next/server";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import ExcelExportLink from "../ExcelExportLink";
import ReportPageSuspense from "../ReportPageSuspense";
import { buildPurchaseReportWhere } from "@/lib/reports/filters";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Purchase Reports",
  description: "Search and review purchases by date, status, and payment type.",
};

const querySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const sortFields = ["reference", "supplier", "status", "grandTotal", "createdAt"] as const;
const sortOptions = [
  { value: "reference", label: "Reference" },
  { value: "supplier", label: "Supplier" },
  { value: "status", label: "Status" },
  { value: "grandTotal", label: "Grand Total" },
  { value: "createdAt", label: "Created On" },
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PurchaseReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <ReportPageSuspense>
      <PurchaseReportContent searchParams={searchParams} />
    </ReportPageSuspense>
  );
}

async function PurchaseReportContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const parsedQuery = querySchema.safeParse(params.q);
  const parsedDate = dateSchema.safeParse(params.date);
  const parsedPage = pageSchema.safeParse(params.page);
  const parsedPageSize = pageSizeSchema.safeParse(params.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const date = parsedDate.success ? parsedDate.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(params.sortBy, sortFields, "createdAt");
  const sortOrder = parseSortOrder(params.sortOrder);

  const where = buildPurchaseReportWhere(query, date);
  const [totalCount, requestedPurchases] = await Promise.all([
    db.purchase.count({ where }),
    fetchPurchases(where, requestedPage, pageSize, sortBy, sortOrder),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const purchases = currentPage === requestedPage
    ? requestedPurchases
    : await fetchPurchases(where, currentPage, pageSize, sortBy, sortOrder);
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = { query, date, pageSize, sortBy, sortOrder };

  return (
    <main className="gg-content reports-content">
      <div className="rpt-toolbar purchase-report-toolbar">
        <div className="report-toolbar-controls">
          <AutoSearchForm
            action="/reports/purchase"
            className="purchase-report-search"
            id="purchase-report-search"
            label="Search purchases"
            value={query}
          />

          <div className="gg-spacer" />

          <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions}>
            <div className="purchase-report-date-form">
              <div className="purchase-report-date-field">
              <DynamicFilterControl
                id="purchase-report-date"
                name="date"
                label="Filter purchases by date"
                type="date"
                value={date}
                className="gg-input"
                visibleLabel
                wrapperClassName="date-filter-control"
              />
              <CalendarDays aria-hidden="true" />
              </div>
            </div>
          </TableSortFilter>
          <div className="report-toolbar-export">
            <ExcelExportLink report="purchase" query={query} date={date} />
          </div>
        </div>
      </div>

      <div className="gg-table-wrap">
        <table className="gg-table gg-table--spaced purchase-report-table">
          <thead>
            <tr>
              <SortableTableHeader label="Reference" sortKey="reference" sortBy={sortBy} sortOrder={sortOrder} pathname="/reports/purchase" searchParams={params} />
              <SortableTableHeader label="Supplier" sortKey="supplier" sortBy={sortBy} sortOrder={sortOrder} pathname="/reports/purchase" searchParams={params} />
              <SortableTableHeader label="Status" sortKey="status" sortBy={sortBy} sortOrder={sortOrder} pathname="/reports/purchase" searchParams={params} />
              <SortableTableHeader label="Grand Total" sortKey="grandTotal" sortBy={sortBy} sortOrder={sortOrder} pathname="/reports/purchase" searchParams={params} className="gg-num" />
              <th scope="col" className="gg-num">Paid</th>
              <th scope="col" className="gg-num">Due</th>
              <th scope="col">Payment Type</th>
              <SortableTableHeader label="Created On" sortKey="createdAt" sortBy={sortBy} sortOrder={sortOrder} pathname="/reports/purchase" searchParams={params} />
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.id}>
                <td><span className="gg-chip-code">{purchase.reference}</span></td>
                <td>{purchase.supplier.name}</td>
                <td>
                  <span className={`gg-badge ${purchase.status === "Received" ? "gg-badge--success" : "gg-badge--warning"}`}>
                    {purchase.status}
                  </span>
                </td>
                <td className="gg-num gg-td-strong">$ {purchase.grandTotal.toFixed(2)}</td>
                <td className="gg-num" title="Purchase payments are not stored in the current data model">—</td>
                <td className="gg-num" title="Purchase balances are not stored in the current data model">—</td>
                <td><span className="gg-chip-unit">{purchase.paymentType}</span></td>
                <td>
                  <span className="gg-chip-time gg-num">
                    {purchase.createdAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                    <time dateTime={purchase.createdAt.toISOString()}>
                      {purchase.createdAt.toLocaleDateString("en", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </time>
                  </span>
                </td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr>
                <td className="purchase-report-empty gg-muted" colSpan={8}>
                  {query || date ? "No purchases match the selected filters." : "No purchases to display."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="gg-pagination">
        <DynamicPageSizeSelect id="purchase-report-page-size" pageSize={pageSize} />
        <span className="gg-muted gg-num" aria-live="polite">
          {firstRecord}–{lastRecord} of {totalCount}
        </span>
        <div className="gg-spacer" />
        <PageLink page={1} currentPage={currentPage} totalPages={totalPages} params={paginationParams} label="First page">
          <ChevronFirst aria-hidden="true" />
        </PageLink>
        <PageLink
          page={Math.max(1, currentPage - 1)}
          currentPage={currentPage}
          totalPages={totalPages}
          params={paginationParams}
          label="Previous page"
        >
          <ChevronLeft aria-hidden="true" />
        </PageLink>
        <PageLink
          page={Math.min(totalPages, currentPage + 1)}
          currentPage={currentPage}
          totalPages={totalPages}
          params={paginationParams}
          label="Next page"
        >
          <ChevronRight aria-hidden="true" />
        </PageLink>
        <PageLink page={totalPages} currentPage={currentPage} totalPages={totalPages} params={paginationParams} label="Last page">
          <ChevronLast aria-hidden="true" />
        </PageLink>
      </div>
    </main>
  );
}

function fetchPurchases(
  where: Prisma.PurchaseWhereInput,
  page: number,
  pageSize: number,
  sortBy: (typeof sortFields)[number],
  sortOrder: "asc" | "desc",
) {
  const orderBy: Prisma.PurchaseOrderByWithRelationInput[] =
    sortBy === "supplier"
      ? [{ supplier: { name: sortOrder } }, { createdAt: sortOrder }]
      : [{ [sortBy]: sortOrder }, { id: sortOrder }];
  return db.purchase.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      reference: true,
      status: true,
      grandTotal: true,
      paymentType: true,
      createdAt: true,
      supplier: { select: { name: true } },
    },
  });
}

function buildHref(
  params: { query: string; date: string; pageSize: number; sortBy: string; sortOrder: "asc" | "desc" },
  page: number,
) {
  const searchParams = new URLSearchParams();
  if (params.query) searchParams.set("q", params.query);
  if (params.date) searchParams.set("date", params.date);
  if (params.pageSize !== 10) searchParams.set("pageSize", String(params.pageSize));
  searchParams.set("sortBy", params.sortBy);
  searchParams.set("sortOrder", params.sortOrder);
  if (page > 1) searchParams.set("page", String(page));
  const queryString = searchParams.toString();
  return queryString ? `/reports/purchase?${queryString}` : "/reports/purchase";
}

function PageLink({
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
  params: { query: string; date: string; pageSize: number; sortBy: string; sortOrder: "asc" | "desc" };
  label: string;
  children: React.ReactNode;
}) {
  if (totalPages === 0 || page === currentPage) {
    return (
      <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }

  return (
    <Link className="gg-page-btn" href={buildHref(params, page)} aria-label={label}>
      {children}
    </Link>
  );
}
