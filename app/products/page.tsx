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
  Search,
} from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import ProductDeleteButton from "./ProductDeleteButton";
import ProductListTools from "./ProductListTools";
import { getProductImagePaths } from "./product-images";
import { getProductAccess } from "./authorization";
import WarehouseToast from "../warehouse/WarehouseToast";

export const metadata: Metadata = {
  title: "Products | Inventory",
  description: "Manage inventory products",
};

const pageSizeOptions = [10, 25, 50] as const;
const searchQuerySchema = z.string().trim().max(120);
const pageSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);

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
  const access = await getProductAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const rawSearchParams = await searchParams;
  const parsedQuery = searchQuerySchema.safeParse(rawSearchParams.q);
  const parsedPage = pageSchema.safeParse(rawSearchParams.page);
  const parsedPageSize = pageSizeSchema.safeParse(rawSearchParams.pageSize);
  const query = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;

  const where = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { code: { contains: query } },
            { name: { contains: query } },
            { categoryRecord: { is: { name: { contains: query } } } },
            { brandRecord: { is: { name: { contains: query } } } },
          ],
        }
      : {}),
  };
  const [totalCount, user] = await Promise.all([
    db.product.count({ where }),
    db.user.findFirst({
      where: { id: access.userId, deletedAt: null },
      select: { firstName: true, lastName: true, email: true, image: true },
    }),
  ]);
  if (!user) redirect("/");

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      productUnit: true,
      images: true,
      createdAt: true,
      categoryRecord: { select: { name: true } },
      brandRecord: { select: { name: true } },
    },
  });
  const stockTotals = products.length
    ? await db.productStock.groupBy({
        by: ["productId"],
        where: { productId: { in: products.map((product) => product.id) } },
        _sum: { quantity: true },
      })
    : [];
  const stockByProduct = new Map(
    stockTotals.map((stock) => [stock.productId, stock._sum.quantity?.toString() ?? "0"]),
  );
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const created = rawSearchParams.created === "1";
  const updated = rawSearchParams.updated === "1";
  const deleted = rawSearchParams.deleted === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Products">
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
          <form className="warehouse-search-form" action="/products" role="search">
            <label className="sr-only" htmlFor="product-search">Search products</label>
            <div className="gg-input-icon warehouse-search-control">
              <Search aria-hidden="true" />
              <input
                className="gg-input"
                id="product-search"
                name="q"
                type="search"
                placeholder="Search products"
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
          <ProductListTools />
          <Link className="gg-btn gg-btn--primary" href="/products/create">
            <Plus aria-hidden="true" />
            Create Product
          </Link>
        </div>

        <div className="gg-card gg-card-pad">
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Name</th>
                  <th scope="col">Code</th>
                  <th scope="col">Brand</th>
                  <th scope="col" className="gg-num">Price</th>
                  <th scope="col">Product Unit</th>
                  <th scope="col" className="gg-num">In Stock</th>
                  <th scope="col">Created On</th>
                  <th scope="col" className="product-actions-heading">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const image = getProductImagePaths(product.images)[0];
                  return (
                    <tr key={product.id}>
                      <td>
                        <Link className="product-list-thumb" href={`/products/${encodeURIComponent(product.id)}`} aria-label={`View ${product.name}`}>
                          {image ? (
                            <Image src={image} alt="" width={46} height={46} unoptimized />
                          ) : (
                            <span aria-hidden="true">{product.name.slice(0, 1).toUpperCase()}</span>
                          )}
                        </Link>
                      </td>
                      <td className="gg-td-strong prod-name" title={product.name}>{product.name}</td>
                      <td><span className="gg-chip-code">{product.code}</span></td>
                      <td>{product.brandRecord.name}</td>
                      <td className="gg-num gg-td-strong">$ {product.price.toFixed(2)}</td>
                      <td><span className="gg-chip-unit">{product.productUnit}</span></td>
                      <td className="gg-num">{stockByProduct.get(product.id) ?? "0"}</td>
                      <td><time className="gg-chip-time gg-num" dateTime={product.createdAt.toISOString()}>{product.createdAt.toLocaleDateString()}</time></td>
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
                          <Link
                            className="act-edit"
                            href={`/products/${encodeURIComponent(product.id)}/edit`}
                            aria-label={`Edit ${product.name}`}
                            title="Edit"
                          >
                            <Pencil aria-hidden="true" />
                          </Link>
                          <ProductDeleteButton productId={product.id} productName={product.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={9}>
                      <p className="warehouse-empty-title">
                        {query ? "No products match your search" : "No products yet"}
                      </p>
                      <p className="gg-muted">
                        {query ? "Try another product name, code, category, or brand." : "Create a product to start managing your inventory catalog."}
                      </p>
                      {query ? (
                        <Link className="gg-btn gg-btn--secondary" href="/products">Clear search</Link>
                      ) : (
                        <Link className="gg-btn gg-btn--primary" href="/products/create"><Plus aria-hidden="true" />Create Product</Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="gg-pagination">
            <form className="gg-perpage" action="/products">
              <label className="gg-muted" htmlFor="product-page-size">Records per page</label>
              <select className="gg-select" id="product-page-size" name="pageSize" defaultValue={String(pageSize)}>
                {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              {query && <input type="hidden" name="q" value={query} />}
              <button className="gg-page-btn warehouse-page-size-submit" type="submit" aria-label="Apply page size">
                <ChevronRight aria-hidden="true" />
              </button>
            </form>
            <span className="gg-muted gg-num" aria-live="polite">{firstRecord}–{lastRecord} of {totalCount}</span>
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
    return <span className="gg-page-btn is-disabled" aria-disabled="true" aria-label={label}>{children}</span>;
  }
  return <Link className="gg-page-btn" href={`/products?${params.toString()}`} aria-label={label}>{children}</Link>;
}
