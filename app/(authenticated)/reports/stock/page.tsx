import Link from "next/link";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { connection } from "next/server";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import ExcelExportLink from "../ExcelExportLink";
import ReportPageSuspense from "../ReportPageSuspense";
import { buildStockReportWhere } from "@/lib/reports/filters";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Stock Reports",
  description: "Review product stock levels by warehouse.",
};

const querySchema = z.string().trim().max(120);
const warehouseIdSchema = z.string().max(100);
const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = [
  "code",
  "name",
  "category",
  "purchasePrice",
  "price",
] as const;
const sortOptions = [
  { value: "code", label: "Code" },
  { value: "name", label: "Name" },
  { value: "category", label: "Category" },
  { value: "purchasePrice", label: "Cost" },
  { value: "price", label: "Price" },
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StockReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <ReportPageSuspense>
      <StockReportContent searchParams={searchParams} />
    </ReportPageSuspense>
  );
}

async function StockReportContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await connection();
  const parsedQuery = querySchema.safeParse(params.q);
  const parsedWarehouseId = warehouseIdSchema.safeParse(params.warehouseId);
  const parsedPage = pageSchema.safeParse(params.page);
  const parsedPageSize = pageSizeSchema.safeParse(params.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedWarehouseId = parsedWarehouseId.success
    ? parsedWarehouseId.data
    : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(params.sortBy, sortFields, "name");
  const sortOrder = parseSortOrder(params.sortOrder, "asc");

  const warehouses = await db.warehouse.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const selectedWarehouse = warehouses.find(
    ({ id }) => id === requestedWarehouseId,
  );
  const warehouseId = selectedWarehouse?.id;

  const where: Prisma.ProductWhereInput = buildStockReportWhere(query);
  const totalCount = await db.product.count({ where });
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage =
    totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    sortBy === "category"
      ? [{ categoryRecord: { name: sortOrder } }, { id: sortOrder }]
      : [{ [sortBy]: sortOrder }, { id: sortOrder }];
  const products = await db.product.findMany({
    where,
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      code: true,
      name: true,
      purchasePrice: true,
      price: true,
      productUnit: true,
      categoryRecord: { select: { name: true } },
    },
  });
  const stockTotals = products.length
    ? await db.productStock.groupBy({
        by: ["productId"],
        where: {
          productId: { in: products.map(({ id }) => id) },
          warehouse: {
            is: {
              deletedAt: null,
              ...(warehouseId ? { id: warehouseId } : {}),
            },
          },
        },
        _sum: { quantity: true },
      })
    : [];
  const stockByProduct = new Map(
    stockTotals.map(({ productId, _sum }) => [
      productId,
      _sum.quantity?.toFixed(3) ?? "0.000",
    ]),
  );
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = { query, warehouseId, pageSize, sortBy, sortOrder };

  return (
    <main className="gg-content reports-content">
      <div className="rpt-toolbar stock-report-toolbar">
        <div className="report-toolbar-controls">
          <div
            className="table-search-filter-group"
            role="group"
            aria-label="Search and filters"
          >
            <AutoSearchForm
              action="/reports/stock"
              className="stock-report-search"
              id="stock-report-search"
              label="Search products"
              value={query}
            />
            <TableSortFilter
              sortBy={sortBy}
              sortOrder={sortOrder}
              options={sortOptions}
            >
              <div className="wh-filter stock-report-warehouse-filter">
                <DynamicFilterControl
                  id="stock-report-warehouse"
                  name="warehouseId"
                  label="Warehouse"
                  value={warehouseId ?? ""}
                  options={[
                    { value: "", label: "All Warehouse" },
                    ...warehouses.map((warehouse) => ({
                      value: warehouse.id,
                      label: warehouse.name,
                    })),
                  ]}
                  visibleLabel
                />
              </div>
            </TableSortFilter>
          </div>
          <div className="report-toolbar-export">
            <ExcelExportLink
              report="stock"
              query={query}
              warehouseId={warehouseId}
            />
          </div>
        </div>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table stock-report-table">
            <thead>
              <tr>
                <SortableTableHeader
                  label="Code"
                  sortKey="code"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  pathname="/reports/stock"
                  searchParams={params}
                />
                <SortableTableHeader
                  label="Name"
                  sortKey="name"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  pathname="/reports/stock"
                  searchParams={params}
                />
                <SortableTableHeader
                  label="Category"
                  sortKey="category"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  pathname="/reports/stock"
                  searchParams={params}
                />
                <SortableTableHeader
                  label="Cost"
                  sortKey="purchasePrice"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  pathname="/reports/stock"
                  searchParams={params}
                  className="gg-num"
                />
                <SortableTableHeader
                  label="Price"
                  sortKey="price"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  pathname="/reports/stock"
                  searchParams={params}
                  className="gg-num"
                />
                <th scope="col">Current Stock</th>
                <th scope="col" className="stock-report-action-heading">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <span className="gg-chip-code">{product.code}</span>
                  </td>
                  <td className="gg-td-strong">{product.name}</td>
                  <td>{product.categoryRecord.name}</td>
                  <td className="gg-num">
                    $ {product.purchasePrice.toFixed(2)}
                  </td>
                  <td className="gg-num">$ {product.price.toFixed(2)}</td>
                  <td>
                    <span className="stock-report-quantity">
                      <span className="stock-count gg-num">
                        {stockByProduct.get(product.id) ?? "0.000"}
                      </span>
                      <span className="gg-chip-unit">
                        {product.productUnit}
                      </span>
                    </span>
                  </td>
                  <td className="stock-report-action-cell">
                    <Link
                      className="btn-reports"
                      href={`/reports/stock/${encodeURIComponent(product.id)}`}
                      aria-label={`View stock history for ${product.name}`}
                    >
                      Reports
                    </Link>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td className="stock-report-empty gg-muted" colSpan={7}>
                    {query
                      ? "No products match your search."
                      : "No products to display."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="gg-pagination">
          <DynamicPageSizeSelect
            id="stock-report-page-size"
            pageSize={pageSize}
          />
          <span className="gg-muted gg-num" aria-live="polite">
            {firstRecord}–{lastRecord} of {totalCount}
          </span>
          <div className="gg-spacer" />
          <PageLink
            page={1}
            currentPage={currentPage}
            totalPages={totalPages}
            params={paginationParams}
            label="First page"
          >
            <ChevronFirst aria-hidden="true" />
          </PageLink>
          <PageLink
            page={Math.max(1, currentPage - 1)}
            currentPage={currentPage}
            totalPages={totalPages}
            params={paginationParams}
            label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
          </PageLink>
          <PageLink
            page={Math.min(totalPages, currentPage + 1)}
            currentPage={currentPage}
            totalPages={totalPages}
            params={paginationParams}
            label="Next page"
          >
            <ChevronRight aria-hidden="true" />
          </PageLink>
          <PageLink
            page={totalPages}
            currentPage={currentPage}
            totalPages={totalPages}
            params={paginationParams}
            label="Last page"
          >
            <ChevronLast aria-hidden="true" />
          </PageLink>
        </div>
      </div>
    </main>
  );
}

function buildHref(
  params: {
    query: string;
    warehouseId?: string;
    pageSize: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  },
  page: number,
) {
  const searchParams = new URLSearchParams();
  if (params.query) searchParams.set("q", params.query);
  if (params.warehouseId) searchParams.set("warehouseId", params.warehouseId);
  if (params.pageSize !== 10)
    searchParams.set("pageSize", String(params.pageSize));
  searchParams.set("sortBy", params.sortBy);
  searchParams.set("sortOrder", params.sortOrder);
  if (page > 1) searchParams.set("page", String(page));
  const queryString = searchParams.toString();
  return queryString ? `/reports/stock?${queryString}` : "/reports/stock";
}

function PageLink({
  page,
  currentPage,
  totalPages,
  params,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  params: {
    query: string;
    warehouseId?: string;
    pageSize: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  };
  label: string;
  children: React.ReactNode;
}) {
  if (totalPages === 0 || page === currentPage) {
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
      href={buildHref(params, page)}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
