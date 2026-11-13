import type { Metadata } from "next";
import Image from "next/image";
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
  Pencil,
  Plus,
} from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getProductListData } from "@/features/catalog/products/queries";
import ProductDeleteButton from "./ProductDeleteButton";
import ProductListTools from "./ProductListTools";
import { getProductImagePaths } from "./product-images";
import { getProductViewAccess } from "./authorization";
import WarehouseToast from "@/components/shared/WarehouseToast";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";
import { PERMISSION } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Products",
  description: "Manage inventory products",
};

const searchQuerySchema = z.string().trim().max(120);
const filterIdSchema = z.string().trim().min(1).max(191);
const productStockStatusSchema = z.enum(["Received", "Pending", "Ordered"]);
const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["name", "code", "brand", "price", "createdAt"] as const;
const sortOptions = [
  { value: "name", label: "Name" },
  { value: "code", label: "Code" },
  { value: "brand", label: "Brand" },
  { value: "price", label: "Price" },
  { value: "createdAt", label: "Created On" },
] as const;

type ProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ProductsPage({ searchParams }: ProductsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading products...</p>
        </main>
      }
    >
      <ProductList searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductList({ searchParams }: ProductsPageProps) {
  await connection();
  const access = await getProductViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageProducts = access.user.permissions.includes(
    PERMISSION.manageProducts,
  );

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const parsedStatus = productStockStatusSchema.safeParse(
    rawSearchParams.status,
  );
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(rawSearchParams.sortBy, sortFields, "createdAt");
  const sortOrder = parseSortOrder(rawSearchParams.sortOrder);

  const [filterOptions, user] = await Promise.all([
    Promise.all([
      db.warehouse.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.supplier.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]),
    db.user.findFirst({
      where: { id: access.userId, deletedAt: null },
      select: { firstName: true, lastName: true, email: true, image: true },
    }),
  ]);
  if (!user) redirect("/");

  const [warehouses, suppliers] = filterOptions;
  const parsedWarehouseId = filterIdSchema.safeParse(
    rawSearchParams.warehouseId,
  );
  const parsedSupplierId = filterIdSchema.safeParse(rawSearchParams.supplierId);
  const warehouseId =
    parsedWarehouseId.success &&
    warehouses.some((warehouse) => warehouse.id === parsedWarehouseId.data)
      ? parsedWarehouseId.data
      : undefined;
  const supplierId =
    parsedSupplierId.success &&
    suppliers.some((supplier) => supplier.id === parsedSupplierId.data)
      ? parsedSupplierId.data
      : undefined;
  const status = parsedStatus.success ? parsedStatus.data : undefined;

  const productList = await getProductListData({
    query,
    warehouseId,
    supplierId,
    status,
    requestedPage,
    pageSize,
    sortBy,
    sortOrder,
  });
  const { totalCount, totalPages, currentPage, products, stockByProduct } =
    productList;
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout
      user={{ name: displayName, image: user.image }}
      pageTitle="Products"
    >
      <main className="gg-content">
        {(created || updated || deleted) && (
          <WarehouseToast
            message={
              created
                ? "Product created successfully."
                : updated
                  ? "Product updated successfully."
                  : "Product deleted successfully."
            }
          />
        )}
        <div className="gg-table-toolbar product-toolbar">
          <ProductListTools
            warehouses={warehouses}
            suppliers={suppliers}
            query={query}
            pageSize={pageSize}
            warehouseId={warehouseId}
            supplierId={supplierId}
            status={status}
            sortBy={sortBy}
            sortOrder={sortOrder}
            sortOptions={sortOptions}
          />
          <div className="gg-spacer" />
          {canManageProducts && (
            <Link className="gg-btn gg-btn--primary" href="/products/create">
              <Plus aria-hidden="true" />
              Create Product
            </Link>
          )}
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <SortableTableHeader
                    label="Name"
                    sortKey="name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/products"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Code"
                    sortKey="code"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/products"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Brand"
                    sortKey="brand"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/products"
                    searchParams={rawSearchParams}
                  />
                  <SortableTableHeader
                    label="Price"
                    sortKey="price"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/products"
                    searchParams={rawSearchParams}
                    className="gg-num"
                  />
                  <th scope="col">Product Unit</th>
                  <th scope="col" className="gg-num">
                    In Stock
                  </th>
                  <SortableTableHeader
                    label="Created On"
                    sortKey="createdAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname="/products"
                    searchParams={rawSearchParams}
                  />
                  <th scope="col" className="product-actions-heading">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const image = getProductImagePaths(product.images)[0];
                  return (
                    <tr key={product.id}>
                      <td>
                        <Link
                          className="product-list-thumb"
                          href={`/products/${encodeURIComponent(product.id)}`}
                          aria-label={`View ${product.name}`}
                        >
                          {image ? (
                            <Image
                              src={image}
                              alt=""
                              width={46}
                              height={46}
                              unoptimized
                            />
                          ) : (
                            <span aria-hidden="true">
                              {product.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td
                        className="gg-td-strong prod-name"
                        title={product.name}
                      >
                        {product.name}
                      </td>
                      <td>
                        <span className="gg-chip-code">{product.code}</span>
                      </td>
                      <td>{product.brandRecord.name}</td>
                      <td className="gg-num gg-td-strong">
                        $ {product.price.toFixed(2)}
                      </td>
                      <td>
                        <span className="gg-chip-unit">
                          {product.productUnit}
                        </span>
                      </td>
                      <td className="gg-num">
                        {stockByProduct.get(product.id) ?? "0"}
                      </td>
                      <td>
                        <time
                          className="gg-chip-time gg-num"
                          dateTime={product.createdAt.toISOString()}
                        >
                          {product.createdAt.toLocaleDateString()}
                        </time>
                      </td>
                      <td className="product-actions-cell">
                        <div className="row-acts">
                          <Link
                            className="act-view"
                            href={`/products/${encodeURIComponent(product.id)}`}
                            aria-label={`View ${product.name}`}
                            title="View"
                          >
                            <Eye aria-hidden="true" />
                          </Link>
                          {canManageProducts && (
                            <Link
                              className="act-edit"
                              href={`/products/${encodeURIComponent(product.id)}/edit`}
                              aria-label={`Edit ${product.name}`}
                              title="Edit"
                            >
                              <Pencil aria-hidden="true" />
                            </Link>
                          )}
                          {canManageProducts && (
                            <ProductDeleteButton
                              productId={product.id}
                              productName={product.name}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={9}>
                      <p className="warehouse-empty-title">
                        {query || warehouseId || supplierId || status
                          ? "No products match your search or filters"
                          : "No products yet"}
                      </p>
                      <p className="gg-muted">
                        {query || warehouseId || supplierId || status
                          ? "Try changing the search, warehouse, supplier, or status."
                          : "Create a product to start managing your inventory catalog."}
                      </p>
                      {warehouseId || supplierId || status ? (
                        <Link
                          className="gg-btn gg-btn--secondary"
                          href={`/products?${new URLSearchParams({
                            ...(query ? { q: query } : {}),
                            pageSize: String(pageSize),
                          }).toString()}`}
                        >
                          Clear filters
                        </Link>
                      ) : query ? (
                        <Link
                          className="gg-btn gg-btn--secondary"
                          href="/products"
                        >
                          Clear search
                        </Link>
                      ) : canManageProducts ? (
                        <Link
                          className="gg-btn gg-btn--primary"
                          href="/products/create"
                        >
                          <Plus aria-hidden="true" />
                          Create Product
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="gg-pagination">
            <DynamicPageSizeSelect id="product-page-size" pageSize={pageSize} />
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PaginationLink
              page={1}
              currentPage={currentPage}
              totalPages={totalPages}
              query={query}
              warehouseId={warehouseId}
              supplierId={supplierId}
              status={status}
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
              warehouseId={warehouseId}
              supplierId={supplierId}
              status={status}
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
              warehouseId={warehouseId}
              supplierId={supplierId}
              status={status}
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
              warehouseId={warehouseId}
              supplierId={supplierId}
              status={status}
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
  warehouseId,
  supplierId,
  status,
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
  warehouseId?: string;
  supplierId?: string;
  status?: "Received" | "Pending" | "Ordered";
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
  if (warehouseId) params.set("warehouseId", warehouseId);
  if (supplierId) params.set("supplierId", supplierId);
  if (status) params.set("status", status);
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
      href={`/products?${params.toString()}`}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
