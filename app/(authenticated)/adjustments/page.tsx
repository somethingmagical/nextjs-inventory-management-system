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
  Eye,
  Plus,
} from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import AdjustmentDeleteButton from "./AdjustmentDeleteButton";
import { getAdjustmentViewAccess } from "./authorization";
import { PERMISSION } from "@/lib/permissions";
import WarehouseToast from "@/components/shared/WarehouseToast";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Adjustments",
  description: "Manage warehouse stock adjustments",
};

const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["reference", "date"] as const;
const sortOptions = [
  { value: "reference", label: "Reference" },
  { value: "date", label: "Date" },
] as const;

type AdjustmentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function AdjustmentsPage({ searchParams }: AdjustmentsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading adjustments...</p>
        </main>
      }
    >
      <AdjustmentList searchParams={searchParams} />
    </Suspense>
  );
}

async function AdjustmentList({ searchParams }: AdjustmentsPageProps) {
  await connection();
  const access = await getAdjustmentViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageAdjustments = access.user.permissions.includes(PERMISSION.manageAdjustments);

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(rawSearchParams.sortBy, sortFields, "date");
  const sortOrder = parseSortOrder(rawSearchParams.sortOrder);

  const where = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { reference: { contains: query } },
            { warehouse: { is: { name: { contains: query } } } },
            {
              items: {
                some: {
                  product: {
                    is: {
                      OR: [
                        { name: { contains: query } },
                        { code: { contains: query } },
                      ],
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  const fetchPage = (page: number) => db.adjustment.findMany({
    where,
    orderBy: [{ [sortBy]: sortOrder }, { createdAt: sortOrder }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      reference: true,
      date: true,
      createdAt: true,
      warehouse: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const [totalCount, requestedAdjustments] = await Promise.all([
    db.adjustment.count({ where }),
    fetchPage(requestedPage),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const adjustments = currentPage === requestedPage
    ? requestedAdjustments
    : await fetchPage(currentPage);

  const { user } = access;
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const created = rawSearchParams.created === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Adjustments">
      <main className="gg-content">
        {(created || deleted) && (
          <WarehouseToast
            message={created ? "Adjustment created successfully." : "Adjustment deleted successfully."}
          />
        )}
        <div className="gg-table-toolbar product-toolbar">
          <AutoSearchForm
            action="/adjustments"
            className="warehouse-search-form"
            iconClassName="gg-input-icon warehouse-search-control"
            id="adjustment-search"
            label="Search adjustments"
            placeholder="Search reference, warehouse, or product"
            value={query}
          />
          <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions} />
          <div className="gg-spacer" />
          {canManageAdjustments && <Link className="gg-btn gg-btn--primary" href="/adjustments/create">
            <Plus aria-hidden="true" />
            Create Adjustment
          </Link>}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader label="Reference" sortKey="reference" sortBy={sortBy} sortOrder={sortOrder} pathname="/adjustments" searchParams={rawSearchParams} />
                  <th scope="col">Warehouse</th>
                  <SortableTableHeader label="Date / Created On" sortKey="date" sortBy={sortBy} sortOrder={sortOrder} pathname="/adjustments" searchParams={rawSearchParams} />
                  <th scope="col" className="gg-num">Items</th>
                  <th scope="col" className="product-actions-heading">Action</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td><span className="gg-chip-code">{adjustment.reference}</span></td>
                    <td className="gg-td-strong">{adjustment.warehouse?.name ?? "Warehouse unavailable"}</td>
                    <td>
                      <div className="warehouse-detail-cell">
                        <time dateTime={adjustment.date.toISOString()}>
                          {adjustment.date.toLocaleDateString("en", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </time>
                        <time className="gg-muted" dateTime={adjustment.createdAt.toISOString()}>
                          Created {adjustment.createdAt.toLocaleDateString()}
                        </time>
                      </div>
                    </td>
                    <td className="gg-num">{adjustment._count.items}</td>
                    <td className="product-actions-cell">
                      <div className="row-acts">
                        <Link
                          className="act-view"
                          href={`/adjustments/${encodeURIComponent(adjustment.id)}`}
                          aria-label={`View ${adjustment.reference}`}
                          title="View"
                        >
                          <Eye aria-hidden="true" />
                        </Link>
                        {canManageAdjustments && <AdjustmentDeleteButton
                          adjustmentId={adjustment.id}
                          reference={adjustment.reference}
                        />}
                      </div>
                    </td>
                  </tr>
                ))}
                {adjustments.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={5}>
                      <p className="warehouse-empty-title">
                        {query ? "No adjustments match your search" : "No adjustments yet"}
                      </p>
                      <p className="gg-muted">
                        {query
                          ? "Try another reference, warehouse, or product."
                          : canManageAdjustments
                            ? "Create an adjustment to correct stock for a warehouse."
                            : "No adjustments are available."}
                      </p>
                      {query ? (
                        <Link className="gg-btn gg-btn--secondary" href="/adjustments">Clear search</Link>
                      ) : canManageAdjustments ? (
                        <Link className="gg-btn gg-btn--primary" href="/adjustments/create">
                          <Plus aria-hidden="true" />Create Adjustment
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="gg-pagination">
            <DynamicPageSizeSelect id="adjustment-page-size" pageSize={pageSize} />
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
    return <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>;
  }
  return <Link className="gg-page-btn" href={`/adjustments?${params.toString()}`} aria-label={label}>{children}</Link>;
}
