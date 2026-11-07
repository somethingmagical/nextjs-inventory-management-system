import Link from "next/link";
import {
  CalendarDays,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Filter,
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

export const metadata: Metadata = {
  title: "Purchase Reports",
  description: "Search and review purchases by date, status, and payment type.",
};

const pageSizeOptions = [10, 25, 50] as const;
const querySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

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

  const where = buildPurchaseReportWhere(query, date);
  const [totalCount, requestedPurchases] = await Promise.all([
    db.purchase.count({ where }),
    fetchPurchases(where, requestedPage, pageSize),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const purchases = currentPage === requestedPage
    ? requestedPurchases
    : await fetchPurchases(where, currentPage, pageSize);
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = { query, date, pageSize };

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

          <form className="purchase-report-date-form" action="/reports/purchase" role="search">
            <label className="sr-only" htmlFor="purchase-report-date">Filter purchases by date</label>
            <div className="purchase-report-date-field">
              <input
                className="gg-input"
                id="purchase-report-date"
                name="date"
                type="date"
                defaultValue={date}
                aria-label="Filter by date"
              />
              <CalendarDays aria-hidden="true" />
            </div>
            {query && <input type="hidden" name="q" value={query} />}
            <input type="hidden" name="pageSize" value={pageSize} />
            <button className="btn-icon-gold" type="submit" aria-label="Apply date filter">
              <Filter aria-hidden="true" />
            </button>
          </form>
          <div className="report-toolbar-export">
            <ExcelExportLink report="purchase" query={query} date={date} />
          </div>
        </div>
      </div>

      <div className="gg-table-wrap">
        <table className="gg-table gg-table--spaced purchase-report-table">
          <thead>
            <tr>
              <th scope="col">Reference</th>
              <th scope="col">Supplier</th>
              <th scope="col">Status</th>
              <th scope="col" className="gg-num">Grand Total</th>
              <th scope="col" className="gg-num">Paid</th>
              <th scope="col" className="gg-num">Due</th>
              <th scope="col">Payment Type</th>
              <th scope="col">Created On</th>
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
        <form className="gg-perpage" action="/reports/purchase">
          <label className="gg-muted" htmlFor="purchase-report-page-size">Records per page</label>
          <select
            className="gg-select"
            id="purchase-report-page-size"
            name="pageSize"
            defaultValue={String(pageSize)}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {query && <input type="hidden" name="q" value={query} />}
          {date && <input type="hidden" name="date" value={date} />}
          <button className="gg-page-btn purchase-report-page-size-submit" type="submit" aria-label="Apply page size">
            <ChevronRight aria-hidden="true" />
          </button>
        </form>
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

function fetchPurchases(where: Prisma.PurchaseWhereInput, page: number, pageSize: number) {
  return db.purchase.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
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
  params: { query: string; date: string; pageSize: number },
  page: number,
) {
  const searchParams = new URLSearchParams();
  if (params.query) searchParams.set("q", params.query);
  if (params.date) searchParams.set("date", params.date);
  if (params.pageSize !== 10) searchParams.set("pageSize", String(params.pageSize));
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
  params: { query: string; date: string; pageSize: number };
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
