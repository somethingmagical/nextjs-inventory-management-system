import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { auth } from "@/auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import WarehouseDeleteButton from "./WarehouseDeleteButton";
import WarehouseToast from "@/components/shared/WarehouseToast";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

export const metadata: Metadata = {
  title: "Warehouses",
  description: "Manage inventory warehouses",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

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

  const [user, totalCount] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true, email: true, image: true },
    }),
    db.warehouse.count({
      where: {
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
      },
    }),
  ]);

  if (!user) {
    redirect("/");
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const warehouses = await db.warehouse.findMany({
    where: {
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
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      city: true,
      country: true,
      createdAt: true,
    },
  });

  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Warehouse">
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
          <div className="gg-spacer" />
          <Link className="gg-btn gg-btn--primary" href="/warehouse/create">
            <Plus aria-hidden="true" />
            Create Warehouse
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email / Phone</th>
                  <th scope="col">City / Country</th>
                  <th scope="col">Created On</th>
                  <th className="warehouse-actions-heading" scope="col">Action</th>
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
                    <td className="warehouse-actions-cell">
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
                    </td>
                  </tr>
                ))}
                {warehouses.length === 0 && (
                  <tr>
                    <td className="warehouse-empty-cell" colSpan={5}>
                      <p className="warehouse-empty-title">
                        {query ? "No warehouses match your search" : "No warehouses yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another name, email, or city."
                          : "Create a warehouse to start organizing your inventory."}
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
            <form className="gg-perpage" action="/warehouse">
              <label className="gg-muted" htmlFor="warehouse-page-size">Records per page</label>
              <select
                className="gg-select"
                id="warehouse-page-size"
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
    <Link className="gg-page-btn" href={`/warehouse?${params.toString()}`} aria-label={label}>
      {children}
    </Link>
  );
}
