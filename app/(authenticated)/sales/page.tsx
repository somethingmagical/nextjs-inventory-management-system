import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SaleRowActions from "@/components/sales/SaleRowActions";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { db } from "@/lib/db";
import { getSaleAccess } from "./authorization";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

export const metadata: Metadata = {
  title: "Sales",
  description: "Manage customer sales",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

type SalesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SalesPage({ searchParams }: SalesPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sales...</p>
        </main>
      }
    >
      <SaleList searchParams={searchParams} />
    </Suspense>
  );
}

async function SaleList({ searchParams }: SalesPageProps) {
  await connection();
  const access = await getSaleAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const parsedDate = dateSchema.safeParse(rawSearchParams.date);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const date = parsedDate.success ? parsedDate.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const statusMatch = (["Pending", "Ordered", "Received"] as const)
    .find((status) => status.toLowerCase() === query.toLowerCase());
  const paymentStatusMatch = (["Paid", "Unpaid", "Partial"] as const)
    .find((status) => status.toLowerCase() === query.toLowerCase());
  const searchConditions: Prisma.SaleWhereInput[] = [
    { reference: { contains: query } },
    { customer: { is: { name: { contains: query } } } },
    { warehouse: { is: { name: { contains: query } } } },
    { paymentType: { contains: query } },
  ];
  if (statusMatch) searchConditions.push({ status: statusMatch });
  if (paymentStatusMatch) searchConditions.push({ paymentStatus: paymentStatusMatch });

  const where: Prisma.SaleWhereInput = {
    deletedAt: null,
    ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
    ...(query ? { OR: searchConditions } : {}),
  };
  const fetchPage = (page: number) => db.sale.findMany({
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
      paymentType: true,
      createdAt: true,
      customer: { select: { name: true } },
      warehouse: { select: { name: true } },
    },
  });
  const [totalCount, totals, requestedSales] = await Promise.all([
    db.sale.count({ where }),
    db.sale.aggregate({
      where: { ...where, status: "Received" },
      _sum: { grandTotal: true, paid: true },
    }),
    fetchPage(requestedPage),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const sales = currentPage === requestedPage
    ? requestedSales
    : await fetchPage(currentPage);
  const { user } = access;
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Sales">
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "Sale created successfully."
                : updated
                  ? "Sale updated successfully."
                  : "Sale deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar purchase-toolbar">
          <AutoSearchForm
            action="/sales"
            className="purchase-search-form"
            id="sale-search"
            label="Search sales"
            value={query}
          />
          <div className="gg-spacer" />
          <form className="purchase-date-form" action="/sales" role="search">
            <label className="sr-only" htmlFor="sale-date-filter">Filter sales by date</label>
            <div className="purchase-date-field">
              <input
                className="gg-input"
                id="sale-date-filter"
                name="date"
                type="date"
                defaultValue={date}
                aria-label="Filter by date"
              />
              <CalendarDays aria-hidden="true" />
            </div>
            {query && <input type="hidden" name="q" value={query} />}
            <input type="hidden" name="pageSize" value={pageSize} />
            <button className="gg-icon-btn purchase-filter-submit" type="submit" aria-label="Apply filters">
              <Filter aria-hidden="true" />
            </button>
          </form>
          <Link className="gg-btn gg-btn--primary" href="/sales/create">
            <Plus aria-hidden="true" />
            Create Sale
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Warehouse</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="gg-num">Grand Total</th>
                  <th scope="col" className="gg-num">Paid</th>
                  <th scope="col">Payment Status</th>
                  <th scope="col">Payment Type</th>
                  <th scope="col">Created On</th>
                  <th scope="col" className="purchase-actions-heading">Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td><span className="gg-chip-code">{sale.reference}</span></td>
                    <td className="gg-muted">{sale.customer.name}</td>
                    <td>{sale.warehouse.name}</td>
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
                    <td><span className="gg-chip-unit">{sale.paymentType}</span></td>
                    <td>
                      <span className="gg-chip-time gg-num">
                        {sale.createdAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                        <time dateTime={sale.createdAt.toISOString()}>
                          {sale.createdAt.toLocaleDateString("en", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </time>
                      </span>
                    </td>
                    <td className="purchase-actions-cell">
                      <SaleRowActions saleId={sale.id} reference={sale.reference} />
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={10}>
                      <p className="warehouse-empty-title">
                        {query || date ? "No sales match your filters" : "No sales yet"}
                      </p>
                      <p className="gg-muted">
                        {query || date
                          ? "Try changing the search or date filter."
                          : "Create a sale to record customer transactions."}
                      </p>
                      {query || date ? (
                        <Link className="gg-btn gg-btn--secondary" href="/sales">Clear filters</Link>
                      ) : (
                        <Link className="gg-btn gg-btn--primary" href="/sales/create">
                          <Plus aria-hidden="true" />Create Sale
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="gg-td-strong">Received Total</td>
                  <td />
                  <td />
                  <td />
                  <td className="gg-num">$ {(totals._sum?.grandTotal ?? new Prisma.Decimal(0)).toFixed(2)}</td>
                  <td className="gg-num">$ {(totals._sum?.paid ?? new Prisma.Decimal(0)).toFixed(2)}</td>
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="gg-pagination">
            <form className="gg-perpage" action="/sales">
              <label className="gg-muted" htmlFor="sale-page-size">Records per page</label>
              <select className="gg-select" id="sale-page-size" name="pageSize" defaultValue={String(pageSize)}>
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {query && <input type="hidden" name="q" value={query} />}
              {date && <input type="hidden" name="date" value={date} />}
              <button className="gg-page-btn warehouse-page-size-submit" type="submit" aria-label="Apply page size">
                <ChevronRight aria-hidden="true" />
              </button>
            </form>
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} label="First page">
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} label="Previous page">
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} label="Next page">
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} label="Last page">
              <ChevronLast aria-hidden="true" />
            </PaginationLink>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

function PaginationLink({
  page,
  currentPage,
  totalPages,
  query,
  date,
  pageSize,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  query: string;
  date: string;
  pageSize: number;
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);
  if (date) params.set("date", date);

  if (isDisabled) {
    return <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>;
  }

  return <Link className="gg-page-btn" href={`/sales?${params.toString()}`} aria-label={label}>{children}</Link>;
}
