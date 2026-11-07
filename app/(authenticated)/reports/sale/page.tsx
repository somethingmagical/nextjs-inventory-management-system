import Link from "next/link";
import {
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
import { buildSaleReportWhere } from "@/lib/reports/filters";
import SaleReportFilters, { SaleReportPageSize } from "./SaleReportFilters";

export const metadata: Metadata = {
  title: "Sale Reports",
  description: "Search and review sales by date, status, and payment totals.",
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

export default function SaleReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <ReportPageSuspense>
      <SaleReportContent searchParams={searchParams} />
    </ReportPageSuspense>
  );
}

async function SaleReportContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await connection();
  const parsedQuery = querySchema.safeParse(params.q);
  const parsedDate = dateSchema.safeParse(params.date);
  const parsedPage = pageSchema.safeParse(params.page);
  const parsedPageSize = pageSizeSchema.safeParse(params.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const date = parsedDate.success ? parsedDate.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const where = buildSaleReportWhere(query, date);
  const [totalCount, requestedSales] = await Promise.all([
    db.sale.count({ where }),
    fetchSales(where, requestedPage, pageSize),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const sales = currentPage === requestedPage
    ? requestedSales
    : await fetchSales(where, currentPage, pageSize);
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = { query, date, pageSize };

  return (
    <main className="gg-content reports-content">
      <div className="rpt-toolbar sale-report-toolbar">
        <SaleReportFilters query={query} date={date} pageSize={pageSize}>
          <div className="report-toolbar-export">
            <ExcelExportLink report="sale" query={query} date={date} />
          </div>
        </SaleReportFilters>
      </div>

      <div className="gg-table-wrap">
        <table className="gg-table gg-table--spaced sale-report-table">
          <thead>
            <tr>
              <th scope="col">Reference</th>
              <th scope="col">Customer</th>
              <th scope="col">Status</th>
              <th scope="col" className="gg-num">Grand Total</th>
              <th scope="col" className="gg-num">Paid</th>
              <th scope="col">Payment Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td><span className="gg-chip-code">{sale.reference}</span></td>
                <td>{sale.customer.name}</td>
                <td>
                  <span className={`gg-badge ${sale.status === "Received" ? "gg-badge--success" : "gg-badge--warning"}`}>
                    {sale.status}
                  </span>
                </td>
                <td className="gg-num gg-td-strong">$ {sale.grandTotal.toFixed(2)}</td>
                <td className="gg-num">$ {sale.paid.toFixed(2)}</td>
                <td>
                  <span className={`gg-badge ${sale.paymentStatus === "Paid" ? "gg-badge--success" : "gg-badge--warning"}`}>
                    {sale.paymentStatus}
                  </span>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td className="sale-report-empty gg-muted" colSpan={6}>
                  {query || date ? "No sales match the selected filters." : "No sales to display."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="gg-pagination">
        <SaleReportPageSize query={query} date={date} pageSize={pageSize} options={pageSizeOptions} />
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

function fetchSales(where: Prisma.SaleWhereInput, page: number, pageSize: number) {
  return db.sale.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      reference: true,
      status: true,
      grandTotal: true,
      paid: true,
      paymentStatus: true,
      customer: { select: { name: true } },
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
  return queryString ? `/reports/sale?${queryString}` : "/reports/sale";
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
