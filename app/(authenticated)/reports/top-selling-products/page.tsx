import { CalendarDays, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { z } from "zod";
import type { ReactNode } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import ReportPageSuspense from "../ReportPageSuspense";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

export const metadata: Metadata = {
  title: "Top Selling Products Reports",
  description: "Review the best-selling products for a selected month.",
};

const querySchema = z.string().trim().max(120);
const yearSchema = z.string().regex(/^\d{4}$/).transform(Number).pipe(z.number().int().min(2000).max(2100));
const monthSchema = z.string().regex(/^(0?[1-9]|1[0-2])$/).transform(Number).pipe(z.number().int().min(1).max(12));
const yearMonthSchema = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .transform((value) => {
    const [year, month] = value.split("-").map(Number);
    return { year, month };
  })
  .pipe(z.object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
  }));
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const pageSizeOptions = [10, 25, 50] as const;
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ProductRow = {
  id: string;
  name: string;
  quantity: number;
  grandTotal: number;
};

export default function TopSellingProductsReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <ReportPageSuspense>
      <TopSellingProductsReportContent searchParams={searchParams} />
    </ReportPageSuspense>
  );
}

async function TopSellingProductsReportContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await connection();
  const now = new Date();
  const parsedQuery = querySchema.safeParse(params.q);
  const parsedYear = yearSchema.safeParse(params.year);
  const parsedMonth = monthSchema.safeParse(params.month);
  const parsedYearMonth = yearMonthSchema.safeParse(params.month);
  const parsedPage = pageSchema.safeParse(params.page);
  const parsedPageSize = pageSizeSchema.safeParse(params.pageSize);

  const query = parsedQuery.success ? parsedQuery.data : "";
  const year = parsedYear.success
    ? parsedYear.data
    : parsedYearMonth.success
      ? parsedYearMonth.data.year
      : now.getUTCFullYear();
  const month = parsedYearMonth.success
    ? parsedYearMonth.data.month
    : parsedMonth.success
      ? parsedMonth.data
      : now.getUTCMonth() + 1;
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const productGroups = await db.saleItem.groupBy({
    by: ["productId"],
    where: {
      sale: {
        is: {
          deletedAt: null,
          status: "Received",
          date: { gte: startOfMonth, lt: startOfNextMonth },
        },
      },
      product: {
        is: {
          deletedAt: null,
          ...(query ? { name: { contains: query } } : {}),
        },
      },
    },
    _sum: {
      quantity: true,
      subtotal: true,
    },
    orderBy: { _sum: { subtotal: "desc" } },
  });

  const totalCount = productGroups.length;
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = productGroups.slice(pageStart, pageStart + pageSize);

  const productIds = pageItems.map(({ productId }) => productId);
  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        select: { id: true, name: true },
      })
    : [];

  const productNameById = new Map(products.map(({ id, name }) => [id, name]));
  const rows: ProductRow[] = pageItems.flatMap((item) => {
    const name = productNameById.get(item.productId);
    if (!name) return [];
    const quantity = Number(item._sum?.quantity ?? 0);
    const grandTotal = Number(item._sum?.subtotal ?? 0);
    return [{
      id: item.productId,
      name,
      quantity,
      grandTotal,
    }];
  });

  const maxTotal = Math.max(
    ...productGroups.map(({ _sum }) => Number(_sum?.subtotal ?? 0)),
    0,
  );
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = { q: query, year: String(year), month: String(month), pageSize };

  return (
    <main className="gg-content reports-content">
      <div className="rpt-toolbar">
        <div className="report-toolbar-controls">
          <AutoSearchForm
            action="/reports/top-selling-products"
            className="rpt-search"
            id="top-products-search"
            label="Search products"
            placeholder="Search products"
            value={query}
          />

          <div className="gg-spacer" />

          <form className="sale-report-date-form" action="/reports/top-selling-products">
            <label className="sr-only" htmlFor="top-products-month">Filter by month</label>
            <div className="sale-report-date-field">
              <input
                className="gg-input"
                id="top-products-month"
                name="month"
                type="month"
                defaultValue={`${year}-${String(month).padStart(2, "0")}`}
              />
              <CalendarDays aria-hidden="true" />
            </div>
            {query && <input type="hidden" name="q" value={query} />}
            <input type="hidden" name="pageSize" value={String(pageSize)} />
            <button className="btn-icon-gold" type="submit" aria-label="Apply month filter">
              <Search aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      <div className="gg-card">
        <div className="gg-card-head">
          <span className="gg-card-title">Top Selling Products</span>
        </div>
        <div className="top-selling-bars">
          {rows.map((row) => (
            <div className="top-selling-bar-row" key={row.id}>
              <div className="top-selling-bar-label">
                <span className="gg-td-strong">{row.name}</span>
                <span className="gg-num">$ {row.grandTotal.toFixed(2)}</span>
              </div>
              <div className="top-selling-bar-track">
                <div
                  style={{
                    width: `${maxTotal === 0 ? 0 : (row.grandTotal / maxTotal) * 100}%`,
                  }}
                  className="top-selling-bar-value"
                />
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="gg-muted top-selling-empty">
              No sales recorded for {monthNames[month - 1]} {year}.
            </p>
          )}
        </div>
      </div>

      <div className="gg-table-wrap top-selling-table-wrap">
        <table className="gg-table gg-table--spaced sale-report-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className="gg-num">Quantity</th>
              <th scope="col" className="gg-num">Grand Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td className="gg-num">{row.quantity}</td>
                <td className="gg-num">$ {row.grandTotal.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="sale-report-empty gg-muted" colSpan={3}>
                  No products match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="gg-pagination top-selling-pagination">
        <form className="gg-perpage" action="/reports/top-selling-products">
          <label className="gg-muted" htmlFor="top-product-report-page-size">Records per page</label>
          <select
            className="gg-select"
            id="top-product-report-page-size"
            name="pageSize"
            defaultValue={String(pageSize)}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {query && <input type="hidden" name="q" value={query} />}
          <input type="hidden" name="year" value={String(year)} />
          <input type="hidden" name="month" value={String(month)} />
          <button className="gg-page-btn sale-report-page-size-submit" type="submit" aria-label="Apply page size">
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
        <PageLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} params={paginationParams} label="Previous page">
          <ChevronLeft aria-hidden="true" />
        </PageLink>
        <PageLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} params={paginationParams} label="Next page">
          <ChevronRight aria-hidden="true" />
        </PageLink>
        <PageLink page={totalPages} currentPage={currentPage} totalPages={totalPages} params={paginationParams} label="Last page">
          <ChevronLast aria-hidden="true" />
        </PageLink>
      </div>
    </main>
  );
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
  params: Record<string, string | number>;
  label: string;
  children: ReactNode;
}) {
  const disabled = page < 1 || page > totalPages || page === currentPage;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== undefined) {
      query.set(key, String(value));
    }
  }
  query.set("page", String(page));

  if (disabled) {
    return (
      <span aria-label={label} aria-disabled="true" className="gg-page-btn is-disabled">
        {children}
      </span>
    );
  }

  return (
    <a aria-label={label} className="gg-page-btn" href={`/reports/top-selling-products?${query.toString()}`}>
      {children}
    </a>
  );
}
