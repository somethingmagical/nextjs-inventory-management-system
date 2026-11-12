import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";
import ReportPageSuspense from "../../ReportPageSuspense";

export const metadata: Metadata = {
  title: "Stock History",
  description: "Review stock movements for a product.",
};

const productIdSchema = z.string().min(1).max(100);
const warehouseIdSchema = z.string().max(191);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["createdAt", "warehouse", "type", "sourceType", "quantity"] as const;
const sortOptions = [
  { value: "createdAt", label: "Date" },
  { value: "warehouse", label: "Warehouse" },
  { value: "type", label: "Movement" },
  { value: "sourceType", label: "Source" },
  { value: "quantity", label: "Quantity" },
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StockHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: SearchParams;
}) {
  return (
    <ReportPageSuspense>
      <StockHistoryContent params={params} searchParams={searchParams} />
    </ReportPageSuspense>
  );
}

async function StockHistoryContent({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: SearchParams;
}) {
  await connection();
  const parsedId = productIdSchema.safeParse((await params).productId);
  if (!parsedId.success) notFound();

  const [product, rawParams] = await Promise.all([
    db.product.findFirst({
      where: {
        id: parsedId.data,
        deletedAt: null,
        categoryRecord: { is: { deletedAt: null } },
      },
      select: { name: true, code: true },
    }),
    searchParams,
  ]);
  if (!product) notFound();

  const parsedWarehouseId = warehouseIdSchema.safeParse(rawParams.warehouseId);
  const parsedPage = pageSchema.safeParse(rawParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawParams.pageSize);
  const requestedWarehouseId = parsedWarehouseId.success ? parsedWarehouseId.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(rawParams.sortBy, sortFields, "createdAt");
  const sortOrder = parseSortOrder(rawParams.sortOrder);

  const warehouses = await db.warehouse.findMany({
    where: {
      deletedAt: null,
      stockMovements: { some: { productId: parsedId.data } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const warehouseId = warehouses.some(({ id }) => id === requestedWarehouseId)
    ? requestedWarehouseId
    : "";
  const where = {
    productId: parsedId.data,
    ...(warehouseId ? { warehouseId } : {}),
  };
  const totalCount = await db.stockMovement.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const orderBy: Prisma.StockMovementOrderByWithRelationInput[] =
    sortBy === "warehouse"
      ? [{ warehouse: { name: sortOrder } }, { createdAt: "desc" }]
      : [{ [sortBy]: sortOrder }, { id: sortOrder }];
  const movements = await db.stockMovement.findMany({
    where,
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      quantity: true,
      type: true,
      sourceType: true,
      createdAt: true,
      warehouse: { select: { name: true } },
      actor: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  const backHref = warehouseId
    ? `/stock?${new URLSearchParams({ warehouseId }).toString()}`
    : "/reports/stock";

  return (
    <main className="gg-content reports-content stock-history-content">
      <div className="page-head">
        <div>
          <h1 className="gg-page-title">Stock History</h1>
          <p className="gg-muted">{product.name} · {product.code}</p>
        </div>
        <Link className="gg-btn gg-btn--secondary" href={backHref}>Back</Link>
      </div>

      <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions}>
        <div className="stock-history-filter">
          <DynamicFilterControl
            id="stock-history-warehouse"
            name="warehouseId"
            label="Warehouse"
            value={warehouseId}
            options={[
              { value: "", label: "All warehouses" },
              ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
            ]}
            visibleLabel
            labelClassName="gg-label"
          />
        </div>
      </TableSortFilter>

      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table stock-history-table">
            <thead>
              <tr>
                <SortableTableHeader label="Date" sortKey="createdAt" sortBy={sortBy} sortOrder={sortOrder} pathname={`/reports/stock/${encodeURIComponent(parsedId.data)}`} searchParams={rawParams} />
                <SortableTableHeader label="Warehouse" sortKey="warehouse" sortBy={sortBy} sortOrder={sortOrder} pathname={`/reports/stock/${encodeURIComponent(parsedId.data)}`} searchParams={rawParams} />
                <SortableTableHeader label="Movement" sortKey="type" sortBy={sortBy} sortOrder={sortOrder} pathname={`/reports/stock/${encodeURIComponent(parsedId.data)}`} searchParams={rawParams} />
                <SortableTableHeader label="Source" sortKey="sourceType" sortBy={sortBy} sortOrder={sortOrder} pathname={`/reports/stock/${encodeURIComponent(parsedId.data)}`} searchParams={rawParams} />
                <SortableTableHeader label="Quantity" sortKey="quantity" sortBy={sortBy} sortOrder={sortOrder} pathname={`/reports/stock/${encodeURIComponent(parsedId.data)}`} searchParams={rawParams} className="gg-num" />
                <th scope="col">Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => {
                const quantity = movement.quantity.toString();
                const positive = movement.quantity.greaterThan(0);
                const actorName = movement.actor
                  ? `${movement.actor.firstName} ${movement.actor.lastName}`.trim() || movement.actor.email
                  : "System";
                return (
                  <tr key={movement.id}>
                    <td>
                      <time dateTime={movement.createdAt.toISOString()}>
                        {movement.createdAt.toLocaleString("en", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </td>
                    <td>{movement.warehouse.name}</td>
                    <td>{movement.type.replace(/([a-z])([A-Z])/g, "$1 $2")}</td>
                    <td>{movement.sourceType ?? "Opening balance snapshot"}</td>
                    <td className={`gg-num stock-history-quantity${positive ? " is-positive" : " is-negative"}`}>
                      {positive ? "+" : ""}{formatQuantity(quantity)}
                    </td>
                    <td>{actorName}</td>
                  </tr>
                );
              })}
              {movements.length === 0 && (
                <tr>
                  <td className="stock-table-empty gg-muted" colSpan={6}>
                    No stock movements were recorded for this product.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="gg-pagination">
          <DynamicPageSizeSelect id="stock-history-page-size" pageSize={pageSize} />
          <span className="gg-muted gg-num" aria-live="polite">
            {recordStart(totalCount, currentPage, pageSize)}–
            {recordEnd(totalCount, currentPage, pageSize)} of {totalCount}
          </span>
          <div className="gg-spacer" />
          <HistoryPageLink page={1} currentPage={currentPage} totalPages={totalPages} productId={parsedId.data} warehouseId={warehouseId} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="First page">
            <ChevronFirst aria-hidden="true" />
          </HistoryPageLink>
          <HistoryPageLink page={Math.max(1, currentPage - 1)} currentPage={currentPage} totalPages={totalPages} productId={parsedId.data} warehouseId={warehouseId} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Previous page">
            <ChevronLeft aria-hidden="true" />
          </HistoryPageLink>
          <HistoryPageLink page={Math.min(totalPages, currentPage + 1)} currentPage={currentPage} totalPages={totalPages} productId={parsedId.data} warehouseId={warehouseId} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Next page">
            <ChevronRight aria-hidden="true" />
          </HistoryPageLink>
          <HistoryPageLink page={totalPages} currentPage={currentPage} totalPages={totalPages} productId={parsedId.data} warehouseId={warehouseId} pageSize={pageSize} sortBy={sortBy} sortOrder={sortOrder} label="Last page">
            <ChevronLast aria-hidden="true" />
          </HistoryPageLink>
        </div>
      </div>
    </main>
  );
}

function formatQuantity(quantity: string) {
  const [whole, fraction] = quantity.split(".");
  const trimmedFraction = fraction?.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function recordStart(totalCount: number, currentPage: number, pageSize: number) {
  return totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
}

function recordEnd(totalCount: number, currentPage: number, pageSize: number) {
  return Math.min(currentPage * pageSize, totalCount);
}

function buildHistoryHref({
  productId,
  warehouseId,
  pageSize,
  sortBy,
  sortOrder,
  page,
}: {
  productId: string;
  warehouseId: string;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  page: number;
}) {
  const searchParams = new URLSearchParams();
  if (warehouseId) searchParams.set("warehouseId", warehouseId);
  if (pageSize !== 10) searchParams.set("pageSize", String(pageSize));
  searchParams.set("sortBy", sortBy);
  searchParams.set("sortOrder", sortOrder);
  if (page > 1) searchParams.set("page", String(page));
  const query = searchParams.toString();
  return `/reports/stock/${encodeURIComponent(productId)}${query ? `?${query}` : ""}`;
}

function HistoryPageLink({
  page,
  currentPage,
  totalPages,
  productId,
  warehouseId,
  pageSize,
  sortBy,
  sortOrder,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  productId: string;
  warehouseId: string;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  label: string;
  children: React.ReactNode;
}) {
  if (totalPages === 0 || page === currentPage) {
    return (
      <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }

  return (
    <Link
      className="gg-page-btn"
      href={buildHistoryHref({ productId, warehouseId, pageSize, sortBy, sortOrder, page })}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
