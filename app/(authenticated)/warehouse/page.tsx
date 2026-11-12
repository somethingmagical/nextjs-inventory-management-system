import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getWarehouseListData } from "@/features/warehouses/queries";
import WarehouseDeleteButton from "./WarehouseDeleteButton";
import WarehouseToast from "@/components/shared/WarehouseToast";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";
import { getWarehouseViewAccess } from "./authorization";
import { PERMISSION } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Warehouses",
  description: "Manage inventory warehouses",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["name", "city", "createdAt"] as const;
const sortOptions = [
  { value: "name", label: "Name" },
  { value: "city", label: "City" },
  { value: "createdAt", label: "Created On" },
] as const;

type WarehousePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function WarehousePage({ searchParams }: WarehousePageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading warehouses...</p>
        </main>
      }
    >
      <WarehouseList searchParams={searchParams} />
    </Suspense>
  );
}

async function WarehouseList({ searchParams }: WarehousePageProps) {
  await connection();
  const access = await getWarehouseViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageWarehouses = access.user.permissions.includes(PERMISSION.manageWarehouses);

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

  const warehouseList = await getWarehouseListData({ query, requestedPage, pageSize, sortBy, sortOrder });

  const { totalCount, totalPages, currentPage, items: warehouses } = warehouseList;

  const displayName =
    `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Warehouse">
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "Warehouse created successfully."
                : updated
                  ? "Warehouse updated successfully."
                  : "Warehouse deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar">
          <AutoSearchForm
            action="/warehouse"
            className="warehouse-search-form"
            iconClassName="gg-input-icon warehouse-search-control"
            id="warehouse-search"
            label="Search warehouses"
            placeholder="Search by name, email, or city"
            value={query}
          />
          <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions} />
          <div className="gg-spacer" />
          {canManageWarehouses && (
            <Link className="gg-btn gg-btn--primary" href="/warehouse/create">
              <Plus aria-hidden="true" />
              Create Warehouse
            </Link>
          )}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader label="Name" sortKey="name" sortBy={sortBy} sortOrder={sortOrder} pathname="/warehouse" searchParams={rawSearchParams} />
                  <th scope="col">Email / Phone</th>
                  <SortableTableHeader label="City / Country" sortKey="city" sortBy={sortBy} sortOrder={sortOrder} pathname="/warehouse" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Created On" sortKey="createdAt" sortBy={sortBy} sortOrder={sortOrder} pathname="/warehouse" searchParams={rawSearchParams} />
                  {canManageWarehouses && <th className="warehouse-actions-heading" scope="col">Action</th>}
                </tr>
              </thead>
              <tbody>
                {warehouses.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td>
                      <div className="warehouse-name-cell">
                        <span className="nm">{warehouse.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="warehouse-detail-cell">
                        <span>{warehouse.email}</span>
                        <span>{warehouse.phoneNumber}</span>
                      </div>
                    </td>
                    <td>
                      <div className="warehouse-detail-cell">
                        <span>{warehouse.city}</span>
                        {warehouse.region && <span>{warehouse.region}</span>}
                        <span>{warehouse.country}</span>
                      </div>
                    </td>
                    <td>
                      <time className="gg-chip-time" dateTime={warehouse.createdAt.toISOString()}>
                        {warehouse.createdAt.toLocaleDateString("en", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </td>
                    {canManageWarehouses && <td className="warehouse-actions-cell">
                      <div className="warehouse-row-actions">
                        <Link
                          className="act-edit"
                          href={`/warehouse/${encodeURIComponent(warehouse.id)}/edit`}
                          aria-label={`Edit ${warehouse.name}`}
                          title="Edit"
                        >
                          <Pencil aria-hidden="true" />
                        </Link>
                        <WarehouseDeleteButton warehouseId={warehouse.id} warehouseName={warehouse.name} />
                      </div>
                    </td>}
                  </tr>
                ))}
                {warehouses.length === 0 && (
                  <tr>
                    <td className="warehouse-empty-cell" colSpan={canManageWarehouses ? 5 : 4}>
                      <p className="warehouse-empty-title">
                        {query ? "No warehouses match your search" : "No warehouses yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another name, email, or city."
                          : canManageWarehouses
                            ? "Create a warehouse to start organizing your inventory."
                            : "No warehouses are available."}
                      </p>
                      {query && (
                        <Link className="gg-btn gg-btn--secondary" href="/warehouse">
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
            <DynamicPageSizeSelect id="warehouse-page-size" pageSize={pageSize} />
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="First page">
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Previous page">
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Next page">
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Last page">
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
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);

  if (isDisabled) {
    return (
      <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }

  return (
    <Link className="gg-page-btn" href={`/warehouse?${params.toString()}`} aria-label={label}>
      {children}
    </Link>
  );
}
