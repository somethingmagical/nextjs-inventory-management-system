import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ArrowLeft, Pencil } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getProductDetails } from "@/features/catalog/products/details";
import { getProductViewAccess } from "../authorization";
import { PERMISSION } from "@/lib/permissions";
import { getProductImagePaths } from "../product-images";
import { productIdSchema } from "../product-schema";

export const metadata: Metadata = {
  title: "Product Details",
  description: "View product information and warehouse stock",
};

type ProductViewPageProps = {
  params: Promise<{ id: string }>;
};

export default function ProductViewPage({ params }: ProductViewPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading product details...</p>
        </main>
      }
    >
      <AuthorizedProductView params={params} />
    </Suspense>
  );
}

async function AuthorizedProductView({ params }: ProductViewPageProps) {
  await connection();
  const access = await getProductViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageProducts = access.user.permissions.includes(PERMISSION.manageProducts);

  const { id } = await params;
  const parsedId = productIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [product, user] = await Promise.all([
    getProductDetails(parsedId.data),
    db.user.findFirst({
      where: { id: access.userId, deletedAt: null },
      select: { firstName: true, lastName: true, email: true, image: true },
    }),
  ]);
  if (!product) notFound();
  if (!user) redirect("/");

  const images = getProductImagePaths(product.images);
  const stockTotal = product.productStocks
    .reduce((total, stock) => total.plus(stock.quantity), new Prisma.Decimal(0))
    .toString();
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: user.image }} pageTitle="Products">
      <main className="gg-content">
        <div className="page-head product-detail-head">
          <div>
            <h1 className="gg-page-title">{product.name}</h1>
            <p className="gg-muted">Product details and stock by warehouse</p>
          </div>
          <div className="product-detail-actions">
            <Link className="gg-btn gg-btn--secondary" href="/products">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
            {canManageProducts && (
              <Link className="gg-btn gg-btn--primary" href={`/products/${encodeURIComponent(product.id)}/edit`}>
                <Pencil aria-hidden="true" />
                Edit Product
              </Link>
            )}
          </div>
        </div>

        <section className="gg-card gg-card-pad product-detail-card" aria-labelledby="product-info-title">
          <h2 className="gg-card-title" id="product-info-title">Product Information</h2>
          <dl className="product-detail-grid">
            <Detail label="Name" value={product.name} />
            <Detail label="Code" value={product.code} />
            <Detail label="Product Category" value={product.categoryRecord.name} />
            <Detail label="Brand" value={product.brandRecord.name} />
            <Detail label="Product Price" value={`$ ${product.price.toFixed(2)}`} />
            <Detail label="Product Unit" value={product.productUnit} />
            <Detail label="Stock Alert" value={product.stockAlert?.toString() ?? "—"} />
            <Detail label="Order Tax" value={product.orderTax === null ? "—" : `${product.orderTax.toString()}%`} />
            <Detail label="Tax Type" value={product.taxType} />
            <Detail label="Quantity Limitation" value={product.quantityLimitation?.toString() ?? "—"} />
            <Detail label="Created On" value={product.createdAt.toLocaleString()} />
            <Detail label="Last Updated" value={product.updatedAt.toLocaleString()} />
            <Detail label="Notes" value={product.notes || "—"} full />
          </dl>
        </section>

        <section className="gg-card gg-card-pad product-detail-card" aria-labelledby="product-images-title">
          <h2 className="gg-card-title" id="product-images-title">Product Images</h2>
          {images.length ? (
            <div className="product-detail-images">
              {images.map((image, index) => (
                <Image
                  key={image}
                  src={image}
                  alt={`${product.name} image ${index + 1}`}
                  width={180}
                  height={180}
                  unoptimized
                />
              ))}
            </div>
          ) : (
            <p className="gg-muted">No images have been added to this product.</p>
          )}
        </section>

        <section className="gg-card gg-card-pad product-detail-card" aria-labelledby="product-stock-title">
          <div className="product-stock-heading">
            <div>
              <h2 className="gg-card-title" id="product-stock-title">Stock by Warehouse</h2>
              <p className="gg-muted">Total recorded quantity: <strong>{stockTotal}</strong></p>
            </div>
          </div>
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Warehouse</th>
                  <th scope="col">Supplier</th>
                  <th scope="col" className="gg-num">Quantity</th>
                  <th scope="col">Status</th>
                  <th scope="col">Added On</th>
                </tr>
              </thead>
              <tbody>
                {product.productStocks.map((stock) => (
                  <tr key={`${product.id}-${stock.warehouse.name}`}>
                    <td>{stock.warehouse.name}</td>
                    <td>{stock.supplier?.name ?? "—"}</td>
                    <td className="gg-num">{stock.quantity.toString()}</td>
                    <td><span className="gg-chip-unit">{stock.status}</span></td>
                    <td><time dateTime={stock.createdAt.toISOString()}>{stock.createdAt.toLocaleDateString()}</time></td>
                  </tr>
                ))}
                {product.productStocks.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={5}>No warehouse stock has been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}

function Detail({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "product-detail-item product-detail-item--full" : "product-detail-item"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
