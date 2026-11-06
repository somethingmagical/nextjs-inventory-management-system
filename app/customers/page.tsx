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
  Search,
} from "lucide-react";
import { z } from "zod";
import { auth } from "@/auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import CustomerImportButton from "./CustomerImportButton";
import CustomerDeleteButton from "./CustomerDeleteButton";
import WarehouseToast from "../warehouse/WarehouseToast";

export const metadata: Metadata = {
  title: "Customers | Inventory",
  description: "Manage inventory customers",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

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
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

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

  const where = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { email: { contains: query } },
            { city: { contains: query } },
          ],
        }
      : {}),
  };

  const [user, totalCount] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true, email: true, image: true },
    }),
    db.customer.count({ where }),
  ]);

  if (!user) {
    redirect("/");
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const customers = await db.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
    },
  });

  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Customers">
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
          <form className="warehouse-search-form" action="/customers" role="search">
            <label className="sr-only" htmlFor="customer-search">Search customers</label>
            <div className="gg-input-icon warehouse-search-control">
              <Search aria-hidden="true" />
              <input
                className="gg-input"
                id="customer-search"
                name="q"
                type="search"
                placeholder="Search customers"
                defaultValue={query}
                maxLength={120}
              />
              <button className="warehouse-search-submit" type="submit" aria-label="Search">
                <Search aria-hidden="true" />
              </button>
            </div>
            <input type="hidden" name="pageSize" value={pageSize} />
          </form>
          <div className="gg-spacer" />
          <CustomerImportButton />
          <Link className="gg-btn gg-btn--primary" href="/customers/create">
            <Plus aria-hidden="true" />
            Create Customer
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Phone Number</th>
                  <th scope="col">Created On</th>
                  <th className="supplier-actions-heading" scope="col">Action</th>
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
                      <td className="supplier-actions-cell">
                        <div className="row-acts">
                          {/* POS sales rely on this walk-in customer when no customer is selected. */}
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
                      </td>
                    </tr>
                  );
                })}
                {customers.length === 0 && (
                  <tr>
                    <td className="supplier-empty-cell" colSpan={4}>
                      <p className="warehouse-empty-title">
                        {query ? "No customers match your search" : "No customers yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another name, email, or city."
                          : "Create a customer to start organizing your customers."}
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
            <form className="gg-perpage" action="/customers">
              <label className="gg-muted" htmlFor="customer-page-size">Records per page</label>
              <select
                className="gg-select"
                id="customer-page-size"
                name="pageSize"
                defaultValue={String(pageSize)}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {query && <input type="hidden" name="q" value={query} />}
              <button className="gg-page-btn warehouse-page-size-submit" type="submit" aria-label="Apply page size">
                <ChevronRight aria-hidden="true" />
              </button>
            </form>
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink page={1} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="First page">
              <ChevronFirst aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Previous page">
              <ChevronLeft aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Next page">
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
            <PaginationLink page={totalPages} currentPage={currentPage} totalPages={totalPages} query={query} pageSize={pageSize} label="Last page">
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
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  query: string;
  pageSize: number;
  label: string;
  children: React.ReactNode;
}) {
  const isDisabled = totalPages === 0 || page === currentPage;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query) params.set("q", query);

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
