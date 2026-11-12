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
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SaleReturnRowActions from "@/components/sales/SaleReturnRowActions";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { db } from "@/lib/db";
import { getSaleReturnViewAccess } from "../authorization";
import { PERMISSION } from "@/lib/permissions";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Sales Returns",
  description: "Manage customer sale returns",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const sortFields = ["reference", "customer", "warehouse", "status", "grandTotal", "paid", "paymentStatus", "date"] as const;
const sortOptions = [
  { value: "reference", label: "Reference" },
  { value: "customer", label: "Customer" },
  { value: "warehouse", label: "Warehouse" },
  { value: "status", label: "Status" },
  { value: "grandTotal", label: "Grand Total" },
  { value: "paid", label: "Paid" },
  { value: "paymentStatus", label: "Payment Status" },
  { value: "date", label: "Date" },
] as const;

type SaleReturnsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SaleReturnsPage({ searchParams }: SaleReturnsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale returns...</p>
        </main>
      }
    >
      <SaleReturnList searchParams={searchParams} />
    </Suspense>
  );
}

async function SaleReturnList({ searchParams }: SaleReturnsPageProps) {
  await connection();
  const access = await getSaleReturnViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageSaleReturns = access.user.permissions.includes(PERMISSION.manageSaleReturn);

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const parsedDate = dateSchema.safeParse(rawSearchParams.date);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const date = parsedDate.success ? parsedDate.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(rawSearchParams.sortBy, sortFields, "date");
  const sortOrder = parseSortOrder(rawSearchParams.sortOrder);

  const statusMatch = (["Pending", "Ordered", "Received"] as const)
    .find((status) => status.toLowerCase() === query.toLowerCase());
  const paymentStatusMatch = (["Paid", "Unpaid", "Partial"] as const)
    .find((status) => status.toLowerCase() === query.toLowerCase());
  const searchConditions: Prisma.SaleReturnWhereInput[] = [
    { reference: { contains: query } },
    { customer: { is: { name: { contains: query } } } },
    { warehouse: { is: { name: { contains: query } } } },
  ];
  if (statusMatch) searchConditions.push({ status: statusMatch });
  if (paymentStatusMatch) searchConditions.push({ paymentStatus: paymentStatusMatch });

  const where: Prisma.SaleReturnWhereInput = {
    deletedAt: null,
    ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
    ...(query ? { OR: searchConditions } : {}),
  };
  const orderBy: Prisma.SaleReturnOrderByWithRelationInput[] =
    sortBy === "customer"
      ? [{ customer: { name: sortOrder } }, { createdAt: sortOrder }]
      : sortBy === "warehouse"
        ? [{ warehouse: { name: sortOrder } }, { createdAt: sortOrder }]
        : [{ [sortBy]: sortOrder }, { createdAt: sortOrder }];
  const fetchPage = (page: number) => db.saleReturn.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      reference: true,
      status: true,
      grandTotal: true,
      paid: true,
      paymentStatus: true,
      createdAt: true,
      customer: { select: { name: true } },
      warehouse: { select: { name: true } },
    },
  });
  const [totalCount, _totals, requestedReturns] = await Promise.all([
    db.saleReturn.count({ where }),
    db.saleReturn.aggregate({ where, _sum: { grandTotal: true, paid: true } }),
    fetchPage(requestedPage),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const returns = currentPage === requestedPage
    ? requestedReturns
    : await fetchPage(currentPage);
  const { user } = access;
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const created = rawSearchParams.created === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Sales Returns">
      <main className="gg-content">
        {(created || deleted) && (
          <WarehouseToast message={created ? "Sale return created successfully." : "Sale return deleted successfully."} />
        )}
        <div className="gg-table-toolbar purchase-toolbar">
          <AutoSearchForm
            action="/sales/returns"
            className="purchase-search-form"
            id="sale-return-search"
            label="Search sale returns"
            value={query}
          />
          <div className="gg-spacer" />
          <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions}>
            <div className="purchase-date-form">
              <div className="purchase-date-field">
              <DynamicFilterControl
                id="sale-return-date-filter"
                name="date"
                label="Filter sale returns by date"
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
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader label="Reference" sortKey="reference" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Customer" sortKey="customer" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Warehouse" sortKey="warehouse" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Status" sortKey="status" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Grand Total" sortKey="grandTotal" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} className="gg-num" />
                  <SortableTableHeader label="Paid" sortKey="paid" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} className="gg-num" />
                  <SortableTableHeader label="Payment Status" sortKey="paymentStatus" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Created On" sortKey="date" sortBy={sortBy} sortOrder={sortOrder} pathname="/sales/returns" searchParams={rawSearchParams} />
                  {canManageSaleReturns && <th scope="col" className="purchase-actions-heading">Action</th>}
                </tr>
              </thead>
              <tbody>
                {returns.map((saleReturn) => (
                  <tr key={saleReturn.id}>
                    <td><Link className="gg-chip-code" href={`/sales/returns/${encodeURIComponent(saleReturn.id)}`}>{saleReturn.reference}</Link></td>
                    <td className="gg-muted">{saleReturn.customer.name}</td>
                    <td>{saleReturn.warehouse?.name ?? "Warehouse unavailable"}</td>
                    <td className="gg-muted">{saleReturn.status}</td>
                    <td className="gg-num gg-td-strong">$ {saleReturn.grandTotal.toFixed(2)}</td>
                    <td className="gg-num">$ {saleReturn.paid.toFixed(2)}</td>
                    <td>
                      <span className={`gg-badge ${saleReturn.paymentStatus === "Paid" ? "gg-badge--success" : "gg-badge--warning"}`}>
                        {saleReturn.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <span className="gg-chip-time gg-num">
                        {saleReturn.createdAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                        <time dateTime={saleReturn.createdAt.toISOString()}>
                          {saleReturn.createdAt.toLocaleDateString("en", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </time>
                      </span>
                    </td>
                    {canManageSaleReturns && <td className="purchase-actions-cell">
                      <SaleReturnRowActions returnId={saleReturn.id} reference={saleReturn.reference} />
                    </td>}
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={canManageSaleReturns ? 9 : 8}>
                      <p className="warehouse-empty-title">
                        {query || date ? "No sale returns match your filters" : "No sale returns yet"}
                      </p>
                      <p className="gg-muted">
                        {query || date
                          ? "Try changing the search or date filter."
                          : "Create a sale return from the actions menu on a sale."}
                      </p>
                      {(query || date) && (
                        <Link className="gg-btn gg-btn--secondary" href="/sales/returns">Clear filters</Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="gg-pagination">
            <DynamicPageSizeSelect id="sale-return-page-size" pageSize={pageSize} />
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="First page">
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Previous page">
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Next page">
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} query={query} date={date} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Last page">
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
  sortBy,
  sortOrder,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  query: string;
  date: string;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);
  if (date) params.set("date", date);
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);

  if (isDisabled) {
    return <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>;
  }

  return <Link className="gg-page-btn" href={`/sales/returns?${params.toString()}`} aria-label={label}>{children}</Link>;
}
