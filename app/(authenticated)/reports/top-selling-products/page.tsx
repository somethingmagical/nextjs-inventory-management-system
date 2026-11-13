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
import type { ReactNode } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import ReportPageSuspense from "../ReportPageSuspense";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Top Selling Products Reports",
  description: "Review the best-selling products for a selected month.",
};

const querySchema = z.string().trim().max(120);
const yearSchema = z
  .string()
  .regex(/^\d{4}$/)
  .transform(Number)
  .pipe(z.number().int().min(2000).max(2100));
const monthSchema = z
  .string()
  .regex(/^(0?[1-9]|1[0-2])$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(12));
const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .transform((value) => {
    const [year, month] = value.split("-").map(Number);
    return { year, month };
  })
  .pipe(
    z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }),
  );
const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["name", "quantity", "grandTotal"] as const;
const sortOptions = [
  { value: "name", label: "Product" },
  { value: "quantity", label: "Quantity" },
  { value: "grandTotal", label: "Grand Total" },
] as const;
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
  const sortBy = parseSortBy(params.sortBy, sortFields, "grandTotal");
  const sortOrder = parseSortOrder(params.sortOrder);

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const where: Prisma.Sql[] = [
    Prisma.sql`s.\`deletedAt\` IS NULL`,
    Prisma.sql`s.\`status\` = 'Received'`,
    Prisma.sql`s.\`date\` >= ${startOfMonth}`,
    Prisma.sql`s.\`date\` < ${startOfNextMonth}`,
    Prisma.sql`p.\`deletedAt\` IS NULL`,
  ];
  if (query) where.push(Prisma.sql`p.\`name\` LIKE CONCAT('%', ${query}, '%')`);
  const fromWhere = Prisma.sql`
    FROM \`SaleItem\` si
    INNER JOIN \`Sale\` s ON s.\`id\` = si.\`saleId\`
    INNER JOIN \`Product\` p ON p.\`id\` = si.\`productId\`
    WHERE ${Prisma.join(where, " AND ")}
  `;
  const countRows = await db.$queryRaw<
    Array<{ totalCount: bigint }>
  >(Prisma.sql`
    SELECT COUNT(*) AS \`totalCount\`
    FROM (
      SELECT si.\`productId\`
      ${fromWhere}
      GROUP BY si.\`productId\`
    ) AS \`productSales\`
  `);
  const totalCount = Number(countRows[0]?.totalCount ?? BigInt(0));
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  const currentPage = Math.min(requestedPage, totalPages);
  const sortExpression = {
    name: Prisma.sql`p.\`name\``,
    quantity: Prisma.sql`SUM(si.\`quantity\`)`,
    grandTotal: Prisma.sql`SUM(si.\`subtotal\`)`,
  }[sortBy];
  const sortDirection =
    sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const [pageRows, maxRows] = await Promise.all([
    db.$queryRaw<
      Array<{ id: string; name: string; quantity: string; grandTotal: string }>
    >(Prisma.sql`
      SELECT
        p.\`id\`,
        p.\`name\`,
        CAST(SUM(si.\`quantity\`) AS CHAR) AS \`quantity\`,
        CAST(SUM(si.\`subtotal\`) AS CHAR) AS \`grandTotal\`
      ${fromWhere}
      GROUP BY p.\`id\`, p.\`name\`
      ORDER BY ${sortExpression} ${sortDirection}, p.\`id\` ASC
      LIMIT ${pageSize} OFFSET ${(currentPage - 1) * pageSize}
    `),
    db.$queryRaw<Array<{ maxTotal: string }>>(Prisma.sql`
      SELECT CAST(COALESCE(MAX(\`productSales\`.\`grandTotal\`), 0) AS CHAR) AS \`maxTotal\`
      FROM (
        SELECT SUM(si.\`subtotal\`) AS \`grandTotal\`
        ${fromWhere}
        GROUP BY si.\`productId\`
      ) AS \`productSales\`
    `),
  ]);
  const rows: ProductRow[] = pageRows.map((row) => ({
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity),
    grandTotal: Number(row.grandTotal),
  }));
  const maxTotal = Number(maxRows[0]?.maxTotal ?? 0);
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = {
    q: query,
    year: String(year),
    month: String(month),
    pageSize,
    sortBy,
    sortOrder,
  };

  return (
    <main className="gg-content reports-content">
      <div className="rpt-toolbar">
        <div className="report-toolbar-controls">
          <div
            className="table-search-filter-group"
            role="group"
            aria-label="Search and filters"
          >
            <AutoSearchForm
              action="/reports/top-selling-products"
              className="rpt-search"
              id="top-products-search"
              label="Search products"
              placeholder="Search products"
              value={query}
            />
            <TableSortFilter
              sortBy={sortBy}
              sortOrder={sortOrder}
              options={sortOptions}
            >
              <div className="sale-report-date-form">
                <div className="sale-report-date-field">
                  <DynamicFilterControl
                    id="top-products-month"
                    name="month"
                    label="Filter by month"
                    type="month"
                    value={`${year}-${String(month).padStart(2, "0")}`}
                    className="gg-input"
                    visibleLabel
                    wrapperClassName="date-filter-control"
                    clearParams={["year"]}
                  />
                  <CalendarDays aria-hidden="true" />
                </div>
              </div>
            </TableSortFilter>
          </div>
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
              <SortableTableHeader
                label="Product"
                sortKey="name"
                sortBy={sortBy}
                sortOrder={sortOrder}
                pathname="/reports/top-selling-products"
                searchParams={params}
              />
              <SortableTableHeader
                label="Quantity"
                sortKey="quantity"
                sortBy={sortBy}
                sortOrder={sortOrder}
                pathname="/reports/top-selling-products"
                searchParams={params}
                className="gg-num"
              />
              <SortableTableHeader
                label="Grand Total"
                sortKey="grandTotal"
                sortBy={sortBy}
                sortOrder={sortOrder}
                pathname="/reports/top-selling-products"
                searchParams={params}
                className="gg-num"
              />
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
        <DynamicPageSizeSelect
          id="top-product-report-page-size"
          pageSize={pageSize}
        />
        <span className="gg-muted gg-num" aria-live="polite">
          {firstRecord}–{lastRecord} of {totalCount}
        </span>
        <div className="gg-spacer" />

        <PageLink
          page={1}
          currentPage={currentPage}
          totalPages={totalPages}
          params={paginationParams}
          label="First page"
        >
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
        <PageLink
          page={totalPages}
          currentPage={currentPage}
          totalPages={totalPages}
          params={paginationParams}
          label="Last page"
        >
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
      <span
        aria-label={label}
        aria-disabled="true"
        className="gg-page-btn is-disabled"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      aria-label={label}
      className="gg-page-btn"
      href={`/reports/top-selling-products?${query.toString()}`}
    >
      {children}
    </Link>
  );
}
