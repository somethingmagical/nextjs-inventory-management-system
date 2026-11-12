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
import { getCustomerListData } from "@/features/partners/customers/queries";
import { getCustomerViewAccess } from "./authorization";
import { PERMISSION } from "@/lib/permissions";
import CustomerImportButton from "./CustomerImportButton";
import CustomerDeleteButton from "./CustomerDeleteButton";
import WarehouseToast from "@/components/shared/WarehouseToast";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Customers",
  description: "Manage inventory customers",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["name", "phoneNumber", "createdAt"] as const;
const sortOptions = [
  { value: "name", label: "Customer" },
  { value: "phoneNumber", label: "Phone Number" },
  { value: "createdAt", label: "Created On" },
] as const;

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CustomersPage({ searchParams }: CustomersPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading customers...</p>
        </main>
      }
    >
      <CustomerList searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomerList({ searchParams }: CustomersPageProps) {
  await connection();
  const access = await getCustomerViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageCustomers = access.user.permissions.includes(PERMISSION.manageCustomers);

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

  const customerList = await getCustomerListData({ query, requestedPage, pageSize, sortBy, sortOrder });

  const { totalCount, totalPages, currentPage, items: customers } = customerList;

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Customers">
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "Customer created successfully."
                : updated
                  ? "Customer updated successfully."
                  : "Customer deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar">
          <AutoSearchForm
            action="/customers"
            className="warehouse-search-form"
            iconClassName="gg-input-icon warehouse-search-control"
            id="customer-search"
            label="Search customers"
            placeholder="Search customers"
            value={query}
          />
          <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions} />
          <div className="gg-spacer" />
          {canManageCustomers && <CustomerImportButton />}
          {canManageCustomers && (
            <Link className="gg-btn gg-btn--primary" href="/customers/create">
              <Plus aria-hidden="true" />
              Create Customer
            </Link>
          )}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader label="Customer" sortKey="name" sortBy={sortBy} sortOrder={sortOrder} pathname="/customers" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Phone Number" sortKey="phoneNumber" sortBy={sortBy} sortOrder={sortOrder} pathname="/customers" searchParams={rawSearchParams} />
                  <SortableTableHeader label="Created On" sortKey="createdAt" sortBy={sortBy} sortOrder={sortOrder} pathname="/customers" searchParams={rawSearchParams} />
                  {canManageCustomers && <th className="supplier-actions-heading" scope="col">Action</th>}
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const isDirectCustomer = customer.id === "direct-customer";

                  return (
                    <tr key={customer.id}>
                      <td>
                        <div className="ppl-cell">
                          <span className="nm">{customer.name}</span>
                          <span className="em">{customer.email}</span>
                        </div>
                      </td>
                      <td className="gg-num">{customer.phoneNumber}</td>
                      <td>
                        <time className="gg-chip-time gg-num" dateTime={customer.createdAt.toISOString()}>
                          {customer.createdAt.toLocaleDateString("en", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </td>
                      {canManageCustomers && <td className="supplier-actions-cell">
                        <div className="row-acts">
                          {!isDirectCustomer && (
                            <Link
                              className="act-edit"
                              href={`/customers/${encodeURIComponent(customer.id)}/edit`}
                              aria-label={`Edit ${customer.name}`}
                              title="Edit"
                            >
                              <Pencil aria-hidden="true" />
                            </Link>
                          )}
                          {!isDirectCustomer && (
                            <CustomerDeleteButton customerId={customer.id} customerName={customer.name} />
                          )}
                        </div>
                      </td>}
                    </tr>
                  );
                })}
                {customers.length === 0 && (
                  <tr>
                    <td className="supplier-empty-cell" colSpan={canManageCustomers ? 4 : 3}>
                      <p className="warehouse-empty-title">
                        {query ? "No customers match your search" : "No customers yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another name, email, or city."
                          : canManageCustomers
                            ? "Create a customer to start organizing your customers."
                            : "No customers are available."}
                      </p>
                      {query && (
                        <Link className="gg-btn gg-btn--secondary" href="/customers">
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
            <DynamicPageSizeSelect id="customer-page-size" pageSize={pageSize} />
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
    <Link className="gg-page-btn" href={`/customers?${params.toString()}`} aria-label={label}>
      {children}
    </Link>
  );
}
