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
  Plus,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PurchaseReturnRowActions from "@/components/purchases/PurchaseReturnRowActions";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { db } from "@/lib/db";
import { getPurchaseReturnViewAccess } from "./authorization";
import { PERMISSION } from "@/lib/permissions";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Purchase Returns",
  description: "Manage supplier purchase returns",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const sortFields = ["reference", "supplier", "warehouse", "status", "grandTotal", "paid", "due", "date"] as const;
const sortOptions = [
  { value: "reference", label: "Reference" },
  { value: "supplier", label: "Supplier" },
  { value: "warehouse", label: "Warehouse" },
  { value: "status", label: "Status" },
  { value: "grandTotal", label: "Grand Total" },
  { value: "paid", label: "Paid" },
  { value: "due", label: "Due" },
  { value: "date", label: "Date" },
] as const;

type PurchaseReturnsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function PurchaseReturnsPage({ searchParams }: PurchaseReturnsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading purchase returns...</p>
        </main>
      }
    >
      <PurchaseReturnList searchParams={searchParams} />
    </Suspense>
  );
}

async function PurchaseReturnList({ searchParams }: PurchaseReturnsPageProps) {
  await connection();
  const access = await getPurchaseReturnViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManagePurchaseReturns = access.user.permissions.includes(PERMISSION.managePurchaseReturn);

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
  const searchConditions: Prisma.PurchaseReturnWhereInput[] = [
    { reference: { contains: query } },
    { supplier: { is: { name: { contains: query } } } },
    { warehouse: { is: { name: { contains: query } } } },
    { paymentType: { contains: query } },
  ];
  if (statusMatch) searchConditions.push({ status: statusMatch });

  const where: Prisma.PurchaseReturnWhereInput = {
    deletedAt: null,
    ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
    ...(query ? { OR: searchConditions } : {}),
  };
  const orderBy: Prisma.PurchaseReturnOrderByWithRelationInput[] =
    sortBy === "supplier"
      ? [{ supplier: { name: sortOrder } }, { createdAt: sortOrder }]
      : sortBy === "warehouse"
        ? [{ warehouse: { name: sortOrder } }, { createdAt: sortOrder }]
        : [{ [sortBy]: sortOrder }, { createdAt: sortOrder }];
  const fetchPage = (page: number) => db.purchaseReturn.findMany({
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
      due: true,
      paymentType: true,
      createdAt: true,
      supplier: { select: { name: true } },
      warehouse: { select: { name: true } },
    },
  });
  const [totalCount, requestedReturns] = await Promise.all([
    db.purchaseReturn.count({ where }),
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
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Purchases Returns">
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "Purchase return created successfully."
                : updated
                  ? "Purchase return updated successfully."
                  : "Purchase return deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar purchase-toolbar">
          <AutoSearchForm
            action="/purchases/returns"
            className="purchase-search-form"
            id="purchase-return-search"
            label="Search purchase returns"
            value={query}
          />
          <div className="gg-spacer" />
          <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions}>
            <div className="purchase-date-form">
              <div className="purchase-date-field">
              <DynamicFilterControl
                id="purchase-return-date-filter"
                name="date"
                label="Filter purchase returns by date"
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
          {canManagePurchaseReturns && <Link className="gg-btn gg-btn--primary" href="/purchases/returns/create">
            <Plus aria-hidden="true" />
            Create Purchase Return
          </Link>}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table purchase-return-table">
              <thead>
                <tr>
                  <SortableTableHeader label="Reference" sortKey="reference" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Supplier" sortKey="supplier" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Warehouse" sortKey="warehouse" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Status" sortKey="status" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Grand Total" sortKey="grandTotal" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} className="gg-num" />
                  <SortableTableHeader label="Paid" sortKey="paid" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} className="gg-num" />
                  <SortableTableHeader label="Due" sortKey="due" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} className="gg-num" />
                  <th scope="col">Payment Type</th>
                  <SortableTableHeader label="Created On" sortKey="date" sortBy={sortBy} sortOrder={sortOrder} pathname="/purchases/returns" searchParams={rawSearchParams} />
                  {canManagePurchaseReturns && <th scope="col" className="purchase-actions-heading">Action</th>}
                </tr>
              </thead>
              <tbody>
                {returns.map((purchaseReturn) => (
                  <tr key={purchaseReturn.id}>
                    <td><Link className="gg-chip-code" href={`/purchases/returns/${encodeURIComponent(purchaseReturn.id)}`}>{purchaseReturn.reference}</Link></td>
                    <td className="gg-muted">{purchaseReturn.supplier.name}</td>
                    <td>{purchaseReturn.warehouse.name}</td>
                    <td>
                      <span className={`gg-badge ${purchaseReturn.status === "Received" ? "gg-badge--success" : "gg-badge--warning"}`}>
                        {purchaseReturn.status}
                      </span>
                    </td>
                    <td className="gg-num gg-td-strong">$ {purchaseReturn.grandTotal.toFixed(2)}</td>
                    <td className="gg-num">$ {purchaseReturn.paid.toFixed(2)}</td>
                    <td className="gg-num">$ {purchaseReturn.due.toFixed(2)}</td>
                    <td><span className="gg-chip-unit">{purchaseReturn.paymentType}</span></td>
                    <td>
                      <span className="gg-chip-time gg-num">
                        {purchaseReturn.createdAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
                        <time dateTime={purchaseReturn.createdAt.toISOString()}>
                          {purchaseReturn.createdAt.toLocaleDateString("en", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </time>
                      </span>
                    </td>
                    {canManagePurchaseReturns && <td className="purchase-actions-cell">
                      <PurchaseReturnRowActions
                        returnId={purchaseReturn.id}
                        reference={purchaseReturn.reference}
                      />
                    </td>}
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={canManagePurchaseReturns ? 10 : 9}>
                      <p className="warehouse-empty-title">
                        {query || date ? "No purchase returns match your filters" : "No purchase returns yet"}
                      </p>
                      <p className="gg-muted">
                        {query || date
                          ? "Try changing the search or date filter."
                          : canManagePurchaseReturns
                            ? "Create a purchase return to record stock sent back to a supplier."
                            : "No purchase returns are available."}
                      </p>
                      {query || date ? (
                        <Link className="gg-btn gg-btn--secondary" href="/purchases/returns">Clear filters</Link>
                      ) : canManagePurchaseReturns ? (
                        <Link className="gg-btn gg-btn--primary" href="/purchases/returns/create">
                          <Plus aria-hidden="true" />Create Purchase Return
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="gg-pagination">
            <DynamicPageSizeSelect id="purchase-return-page-size" pageSize={pageSize} />
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
  return <Link className="gg-page-btn" href={`/purchases/returns?${params.toString()}`} aria-label={label}>{children}</Link>;
}
