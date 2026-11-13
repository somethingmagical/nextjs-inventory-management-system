import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
} from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getSupplierListData } from "@/features/partners/suppliers/queries";
import SupplierImportButton from "./SupplierImportButton";
import SupplierDeleteButton from "./SupplierDeleteButton";
import WarehouseToast from "@/components/shared/WarehouseToast";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";
import { getSupplierViewAccess } from "./authorization";
import { PERMISSION } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Suppliers",
  description: "Manage inventory suppliers",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["name", "phoneNumber", "createdAt"] as const;
const sortOptions = [
  { value: "name", label: "Supplier" },
  { value: "phoneNumber", label: "Phone Number" },
  { value: "createdAt", label: "Created On" },
] as const;

type SuppliersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SuppliersPage({ searchParams }: SuppliersPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading suppliers...</p>
        </main>
      }
    >
      <SupplierList searchParams={searchParams} />
    </Suspense>
  );
}

async function SupplierList({ searchParams }: SuppliersPageProps) {
  await connection();
  const access = await getSupplierViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageSuppliers = access.user.permissions.includes(
    PERMISSION.manageSuppliers,
  );

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(rawSearchParams.sortBy, sortFields, "createdAt");
  const sortOrder = parseSortOrder(rawSearchParams.sortOrder);

  const supplierList = await getSupplierListData({
    query,
    requestedPage,
    pageSize,
    sortBy,
    sortOrder,
  });

  const {
    totalCount,
    totalPages,
    currentPage,
    items: suppliers,
  } = supplierList;

  const displayName =
    `${access.user.firstName} ${access.user.lastName}`.trim() ||
    access.user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <DashboardLayout
      user={{ name: displayName, image: access.user.image }}
      pageTitle="Suppliers"
    >
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "Supplier created successfully."
                : updated
                  ? "Supplier updated successfully."
                  : "Supplier deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar">
          <div
            className="table-search-filter-group"
            role="group"
            aria-label="Search and filters"
          >
            <AutoSearchForm
              action="/suppliers"
              className="warehouse-search-form"
              iconClassName="gg-input-icon warehouse-search-control"
              id="supplier-search"
              label="Search suppliers"
              placeholder="Search suppliers"
              value={query}
            />
            <TableSortFilter
              sortBy={sortBy}
              sortOrder={sortOrder}
              options={sortOptions}
            />
          </div>
          <div className="gg-spacer" />
          {canManageSuppliers && <SupplierImportButton />}
          {canManageSuppliers && (
            <Link className="gg-btn gg-btn--primary" href="/suppliers/create">
              <Plus aria-hidden="true" />
              Create Supplier
            </Link>
          )}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader
                    label="Supplier"
                    sortKey="name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/suppliers"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Phone Number"
                    sortKey="phoneNumber"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/suppliers"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Created On"
                    sortKey="createdAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/suppliers"
                    searchParams={rawSearchParams}
                  />
                  {canManageSuppliers && (
                    <th className="supplier-actions-heading" scope="col">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <div className="ppl-cell">
                        <span className="nm">{supplier.name}</span>
                        <span className="em">{supplier.email}</span>
                      </div>
                    </td>
                    <td className="gg-num">{supplier.phoneNumber}</td>
                    <td>
                      <time
                        className="gg-chip-time gg-num"
                        dateTime={supplier.createdAt.toISOString()}
                      >
                        {supplier.createdAt.toLocaleDateString("en", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </td>
                    {canManageSuppliers && (
                      <td className="supplier-actions-cell">
                        <div className="row-acts">
                          <Link
                            className="act-edit"
                            href={`/suppliers/${encodeURIComponent(supplier.id)}/edit`}
                            aria-label={`Edit ${supplier.name}`}
                            title="Edit"
                          >
                            <Pencil aria-hidden="true" />
                          </Link>
                          <SupplierDeleteButton
                            supplierId={supplier.id}
                            supplierName={supplier.name}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td
                      className="supplier-empty-cell"
                      colSpan={canManageSuppliers ? 4 : 3}
                    >
                      <p className="warehouse-empty-title">
                        {query
                          ? "No suppliers match your search"
                          : "No suppliers yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another name, email, or city."
                          : canManageSuppliers
                            ? "Create a supplier to start organizing your suppliers."
                            : "No suppliers are available."}
                      </p>
                      {query && (
                        <Link
                          className="gg-btn gg-btn--secondary"
                          href="/suppliers"
                        >
                          Clear search
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="gg-pagination">
            <DynamicPageSizeSelect
              id="supplier-page-size"
              pageSize={pageSize}
            />
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink
              page={1}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="First page"
            >
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink
              page={Math.max(1, currentPage - 1)}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink
              page={Math.min(totalPages, currentPage + 1)}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="Next page"
            >
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink
              page={totalPages}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              pageSize={pageSize}
              sortBy={sortBy}
              sortOrder={sortOrder}
              label="Last page"
            >
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
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (query) params.set("q", query);
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);

  if (isDisabled) {
    return (
      <span
        className="gg-page-btn is-disabled"
        aria-disabled="true"
        aria-label={label}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      className="gg-page-btn"
      href={`/suppliers?${params.toString()}`}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
