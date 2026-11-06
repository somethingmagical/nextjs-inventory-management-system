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
import SupplierImportButton from "./SupplierImportButton";
import SupplierDeleteButton from "./SupplierDeleteButton";
import WarehouseToast from "../warehouse/WarehouseToast";

export const metadata: Metadata = {
  title: "Suppliers | Inventory",
  description: "Manage inventory suppliers",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

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
    db.supplier.count({ where }),
  ]);

  if (!user) {
    redirect("/");
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const suppliers = await db.supplier.findMany({
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
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Suppliers">
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
          <form className="warehouse-search-form" action="/suppliers" role="search">
            <label className="sr-only" htmlFor="supplier-search">Search suppliers</label>
            <div className="gg-input-icon warehouse-search-control">
              <Search aria-hidden="true" />
              <input
                className="gg-input"
                id="supplier-search"
                name="q"
                type="search"
                placeholder="Search suppliers"
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
          <SupplierImportButton />
          <Link className="gg-btn gg-btn--primary" href="/suppliers/create">
            <Plus aria-hidden="true" />
            Create Supplier
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Phone Number</th>
                  <th scope="col">Created On</th>
                  <th className="supplier-actions-heading" scope="col">Action</th>
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
                      <time className="gg-chip-time gg-num" dateTime={supplier.createdAt.toISOString()}>
                        {supplier.createdAt.toLocaleDateString("en", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </td>
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
                        <SupplierDeleteButton supplierId={supplier.id} supplierName={supplier.name} />
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td className="supplier-empty-cell" colSpan={4}>
                      <p className="warehouse-empty-title">
                        {query ? "No suppliers match your search" : "No suppliers yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another name, email, or city."
                          : "Create a supplier to start organizing your suppliers."}
                      </p>
                      {query && (
                        <Link className="gg-btn gg-btn--secondary" href="/suppliers">
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
            <form className="gg-perpage" action="/suppliers">
              <label className="gg-muted" htmlFor="supplier-page-size">Records per page</label>
              <select
                className="gg-select"
                id="supplier-page-size"
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
    <Link className="gg-page-btn" href={`/suppliers?${params.toString()}`} aria-label={label}>
      {children}
    </Link>
  );
}
