import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  ArrowLeft,
  ArrowRight,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { Suspense } from "react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import DynamicFilterControl from "@/components/shared/DynamicFilterControl";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import {
  getStockCategoryOptions,
  getStockWarehouseOverview,
  getWarehouseStockData,
} from "@/features/inventory/stock/queries";
import { stockStatuses, type StockStatus, type StockStatusFilter } from "@/features/inventory/stock/policy";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

export const metadata: Metadata = {
  title: "Stock",
  description: "Review product stock by warehouse.",
};

const querySchema = z.string().trim().max(120);
const idSchema = z.string().trim().max(191);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const stockStatusSchema = z.enum(stockStatuses);
const sortFields = ["code", "name", "category", "quantity", "stockAlert"] as const;
const sortOptions = [
  { value: "code", label: "Code" },
  { value: "name", label: "Product" },
  { value: "category", label: "Category" },
  { value: "quantity", label: "On hand" },
  { value: "stockAlert", label: "Stock alert" },
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StockPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading stock...</p>
        </main>
      }
    >
      <StockContent searchParams={searchParams} />
    </Suspense>
  );
}

async function StockContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const access = await requirePermission(PERMISSION.viewStock);
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const params = await searchParams;
  const parsedWarehouseId = idSchema.safeParse(params.warehouseId);
  const parsedQuery = querySchema.safeParse(params.q);
  const parsedCategoryId = idSchema.safeParse(params.categoryId);
  const parsedPage = pageSchema.safeParse(params.page);
  const parsedPageSize = pageSizeSchema.safeParse(params.pageSize);
  const parsedStatus = stockStatusSchema.safeParse(params.status);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedWarehouseId = parsedWarehouseId.success ? parsedWarehouseId.data : "";
  const requestedCategoryId = parsedCategoryId.success ? parsedCategoryId.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const status: StockStatusFilter = parsedStatus.success ? parsedStatus.data : "all";
  const sortBy = parseSortBy(params.sortBy, sortFields, "name");
  const sortOrder = parseSortOrder(params.sortOrder, "asc");

  const warehouses = await getStockWarehouseOverview();
  const selectedWarehouse = warehouses.find(({ id }) => id === requestedWarehouseId);
  const categories = selectedWarehouse ? await getStockCategoryOptions() : [];
  const categoryId = categories.some(({ id }) => id === requestedCategoryId)
    ? requestedCategoryId
    : "";
  const stockData = selectedWarehouse
    ? await getWarehouseStockData({
        warehouseId: selectedWarehouse.id,
        query,
        categoryId,
        status,
        requestedPage,
        pageSize,
        sortBy,
        sortOrder,
      })
    : null;

  const displayName =
    `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const canViewReports =
    access.user.roleName === "admin"
    || access.user.permissions.includes(PERMISSION.manageReports);
  const canManageWarehouses =
    access.user.roleName === "admin"
    || access.user.permissions.includes(PERMISSION.manageWarehouses);

  return (
    <DashboardLayout
      user={{ name: displayName, image: access.user.image }}
      pageTitle="Stock"
    >
      <main className="gg-content stock-content">
        <div className="page-head stock-page-head">
          <div>
            <h1 className="gg-page-title">Stock by warehouse</h1>
            <p className="gg-muted">
              Review on-hand quantities separately for each warehouse.
            </p>
          </div>
          {selectedWarehouse && (
            <Link className="gg-btn gg-btn--secondary" href="/stock">
              <ArrowLeft aria-hidden="true" />
              All warehouses
            </Link>
          )}
        </div>

        {warehouses.length === 0 ? (
          <section className="gg-card gg-card-pad stock-empty-state">
            <h2 className="gg-card-title">No warehouses yet</h2>
            <p className="gg-muted">
              {canManageWarehouses
                ? "Create a warehouse before reviewing its stock."
                : "Ask a warehouse manager to create a warehouse before reviewing stock."}
            </p>
            {canManageWarehouses && (
              <Link className="gg-btn gg-btn--primary" href="/warehouse/create">
                Create warehouse
              </Link>
            )}
          </section>
        ) : (
          <>
            <section className="stock-warehouse-grid" aria-label="Stock summaries by warehouse">
              {warehouses.map((warehouse) => {
                const href = `/stock?${new URLSearchParams({ warehouseId: warehouse.id }).toString()}`;
                const selected = warehouse.id === selectedWarehouse?.id;
                return (
                  <Link
                    className={`gg-card stock-warehouse-card${selected ? " is-selected" : ""}`}
                    href={href}
                    key={warehouse.id}
                    aria-current={selected ? "page" : undefined}
                  >
                    <span className="stock-warehouse-card-heading">
                      <span className="stock-warehouse-icon" aria-hidden="true">
                        <MapPin />
                      </span>
                      <span className="stock-warehouse-card-name">{warehouse.name}</span>
                      <ArrowRight className="stock-warehouse-arrow" aria-hidden="true" />
                    </span>
                    <span className="stock-warehouse-location">
                      {[warehouse.city, warehouse.region, warehouse.country].filter(Boolean).join(", ")}
                    </span>
                    <span className="stock-warehouse-counts">
                      <span>
                        <strong>{formatCount(warehouse.inStockCount)}</strong>
                        <span>In stock</span>
                      </span>
                      <span>
                        <strong>{formatCount(warehouse.lowStockCount)}</strong>
                        <span>Low</span>
                      </span>
                      <span>
                        <strong>{formatCount(warehouse.outOfStockCount)}</strong>
                        <span>Out</span>
                      </span>
                    </span>
                    <span className="stock-warehouse-total">
                      {formatCount(warehouse.productCount)} active product SKUs
                    </span>
                  </Link>
                );
              })}
            </section>

            {selectedWarehouse && stockData && (
              <section className="stock-warehouse-detail" aria-labelledby="stock-warehouse-title">
                <div className="stock-detail-heading">
                  <div>
                    <h2 className="gg-card-title" id="stock-warehouse-title">
                      {selectedWarehouse.name} stock
                    </h2>
                    <p className="gg-muted">
                      {selectedWarehouse.city}, {selectedWarehouse.country}
                    </p>
                  </div>
                </div>

                <div className="gg-table-toolbar stock-table-toolbar">
                  <AutoSearchForm
                    action="/stock"
                    className="stock-search-form"
                    id="stock-product-search"
                    label="Search products in this warehouse"
                    placeholder="Search code, product, or category"
                    value={query}
                  />
                  <TableSortFilter sortBy={sortBy} sortOrder={sortOrder} options={sortOptions}>
                    <div className="stock-filter-form">
                      <DynamicFilterControl
                      id="stock-category-filter"
                      name="categoryId"
                      label="Category"
                      value={categoryId}
                      options={[
                        { value: "", label: "All categories" },
                        ...categories.map((category) => ({ value: category.id, label: category.name })),
                      ]}
                      visibleLabel
                      />
                      <DynamicFilterControl
                      id="stock-status-filter"
                      name="status"
                      label="Stock status"
                      value={status}
                      options={[
                        { value: "all", label: "All stock statuses" },
                        { value: "in-stock", label: "In stock" },
                        { value: "low-stock", label: "Low stock" },
                        { value: "out-of-stock", label: "Out of stock" },
                      ]}
                      visibleLabel
                      />
                    </div>
                  </TableSortFilter>
                </div>

                <div className="gg-card gg-card-pad">
                  <div className="gg-table-wrap">
                    <table className="gg-table stock-table">
                      <thead>
                        <tr>
                          <SortableTableHeader label="Code" sortKey="code" sortBy={sortBy} sortOrder={sortOrder} pathname="/stock" searchParams={params} />
                          <SortableTableHeader label="Product" sortKey="name" sortBy={sortBy} sortOrder={sortOrder} pathname="/stock" searchParams={params} />
                          <SortableTableHeader label="Category" sortKey="category" sortBy={sortBy} sortOrder={sortOrder} pathname="/stock" searchParams={params} />
                          <SortableTableHeader label="On hand" sortKey="quantity" sortBy={sortBy} sortOrder={sortOrder} pathname="/stock" searchParams={params} className="gg-num" />
                          <SortableTableHeader label="Stock alert" sortKey="stockAlert" sortBy={sortBy} sortOrder={sortOrder} pathname="/stock" searchParams={params} className="gg-num" />
                          <th scope="col">Status</th>
                          {canViewReports && <th scope="col">History</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {stockData.items.map((item) => (
                          <tr key={item.id}>
                            <td><span className="gg-chip-code">{item.code}</span></td>
                            <td className="gg-td-strong">{item.name}</td>
                            <td>{item.category}</td>
                            <td className="gg-num">
                              <span className="stock-on-hand">
                                {formatQuantity(item.quantity)}
                                <span className="gg-chip-unit">{item.productUnit}</span>
                              </span>
                            </td>
                            <td className="gg-num">
                              {item.stockAlert === null ? "—" : formatQuantity(item.stockAlert)}
                            </td>
                            <td>
                              <span className={`stock-status stock-status--${item.status}`}>
                                {stockStatusLabels[item.status]}
                              </span>
                            </td>
                            {canViewReports && (
                              <td>
                                <Link
                                  className="stock-history-link"
                                  href={`/reports/stock/${encodeURIComponent(item.id)}?${new URLSearchParams({ warehouseId: selectedWarehouse.id }).toString()}`}
                                  aria-label={`View stock history for ${item.name}`}
                                >
                                  View
                                </Link>
                              </td>
                            )}
                          </tr>
                        ))}
                        {stockData.items.length === 0 && (
                          <tr>
                            <td className="stock-table-empty gg-muted" colSpan={canViewReports ? 7 : 6}>
                              {query || categoryId || status !== "all"
                                ? "No products match these filters."
                                : "No products are available for this warehouse yet."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="gg-pagination">
                    <DynamicPageSizeSelect id="stock-page-size" pageSize={pageSize} />
                    <span className="gg-muted gg-num" aria-live="polite">
                      {recordStart(stockData.totalCount, stockData.currentPage, pageSize)}–
                      {recordEnd(stockData.totalCount, stockData.currentPage, pageSize)} of {stockData.totalCount}
                    </span>
                    <div className="gg-spacer" />
                    <StockPageLink page={1} currentPage={stockData.currentPage} totalPages={stockData.totalPages} params={{ warehouseId: selectedWarehouse.id, query, categoryId, status, pageSize, sortBy, sortOrder }} label="First page">
                      <ChevronFirst aria-hidden="true" />
                    </StockPageLink>
                    <StockPageLink page={Math.max(1, stockData.currentPage - 1)} currentPage={stockData.currentPage} totalPages={stockData.totalPages} params={{ warehouseId: selectedWarehouse.id, query, categoryId, status, pageSize, sortBy, sortOrder }} label="Previous page">
                      <ChevronLeft aria-hidden="true" />
                    </StockPageLink>
                    <StockPageLink page={Math.min(stockData.totalPages, stockData.currentPage + 1)} currentPage={stockData.currentPage} totalPages={stockData.totalPages} params={{ warehouseId: selectedWarehouse.id, query, categoryId, status, pageSize, sortBy, sortOrder }} label="Next page">
                      <ChevronRight aria-hidden="true" />
                    </StockPageLink>
                    <StockPageLink page={stockData.totalPages} currentPage={stockData.currentPage} totalPages={stockData.totalPages} params={{ warehouseId: selectedWarehouse.id, query, categoryId, status, pageSize, sortBy, sortOrder }} label="Last page">
                      <ChevronLast aria-hidden="true" />
                    </StockPageLink>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </DashboardLayout>
  );
}

const stockStatusLabels: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
};

function formatCount(count: number) {
  return new Intl.NumberFormat("en").format(count);
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

function buildStockHref(
  params: {
    warehouseId: string;
    query: string;
    categoryId: string;
    status: StockStatusFilter;
    pageSize: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  },
  page: number,
) {
  const searchParams = new URLSearchParams({ warehouseId: params.warehouseId });
  if (params.query) searchParams.set("q", params.query);
  if (params.categoryId) searchParams.set("categoryId", params.categoryId);
  if (params.status !== "all") searchParams.set("status", params.status);
  if (params.pageSize !== 10) searchParams.set("pageSize", String(params.pageSize));
  searchParams.set("sortBy", params.sortBy);
  searchParams.set("sortOrder", params.sortOrder);
  if (page > 1) searchParams.set("page", String(page));
  return `/stock?${searchParams.toString()}`;
}

function StockPageLink({
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
    warehouseId: string;
    query: string;
    categoryId: string;
    status: StockStatusFilter;
    pageSize: number;
    sortBy: string;
    sortOrder: "asc" | "desc";
  };
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
    <Link className="gg-page-btn" href={buildStockHref(params, page)} aria-label={label}>
      {children}
    </Link>
  );
}
