import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { classifyStockStatus, type StockStatus } from "@/features/inventory/stock/policy";
import { PERMISSION } from "@/lib/permissions";
import { requirePermission } from "@/lib/authorization";

export const metadata: Metadata = {
  title: "Warehouse Stock Details",
  description: "View product stock details for a warehouse.",
};

const idSchema = z.string().trim().min(1).max(191);

type StockDetailsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function StockDetailsPage({
  params,
  searchParams,
}: StockDetailsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading warehouse stock details...</p>
        </main>
      }
    >
      <StockDetailsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StockDetailsContent({
  params,
  searchParams,
}: StockDetailsPageProps) {
  await connection();
  const access = await requirePermission(PERMISSION.viewStock);
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const productId = idSchema.safeParse(id);
  const warehouseId = idSchema.safeParse(query.warehouseId);
  if (!productId.success || !warehouseId.success) notFound();

  const [product, warehouse] = await Promise.all([
    db.product.findFirst({
      where: { id: productId.data, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        productUnit: true,
        stockAlert: true,
        categoryRecord: { select: { name: true, deletedAt: true } },
      },
    }),
    db.warehouse.findFirst({
      where: { id: warehouseId.data, deletedAt: null },
      select: { id: true, name: true, city: true, country: true },
    }),
  ]);
  if (!product || product.categoryRecord.deletedAt || !warehouse) notFound();

  const stock = await db.productStock.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
    select: { quantity: true },
  });
  const quantity = stock?.quantity.toString() ?? "0";
  const status = classifyStockStatus(
    quantity,
    product.stockAlert?.toString() ?? null,
  );
  const displayName =
    `${access.user.firstName} ${access.user.lastName}`.trim() ||
    access.user.email;
  const canEditStock =
    access.user.roleName === "admin" ||
    access.user.permissions.includes(PERMISSION.manageAdjustments);
  const stockHref = `/stock?warehouseId=${encodeURIComponent(warehouse.id)}`;

  return (
    <DashboardLayout
      user={{ name: displayName, image: access.user.image }}
      pageTitle="Stock"
    >
      <main className="gg-content">
        <div className="page-head product-detail-head">
          <div>
            <h1 className="gg-page-title">{product.name}</h1>
            <p className="gg-muted">
              Stock details for {warehouse.name}
            </p>
          </div>
          <div className="product-detail-actions">
            <Link className="gg-btn gg-btn--secondary" href={stockHref}>
              <ArrowLeft aria-hidden="true" />
              Back to warehouse stock
            </Link>
            {canEditStock && (
              <Link
                className="gg-btn gg-btn--primary"
                href={`/stock/${encodeURIComponent(product.id)}/edit?warehouseId=${encodeURIComponent(warehouse.id)}`}
              >
                <Pencil aria-hidden="true" />
                Edit Stock
              </Link>
            )}
          </div>
        </div>

        <section
          className="gg-card gg-card-pad product-detail-card"
          aria-labelledby="stock-info-title"
        >
          <h2 className="gg-card-title" id="stock-info-title">
            Stock Information
          </h2>
          <dl className="product-detail-grid">
            <Detail label="Product" value={product.name} />
            <Detail label="Product code" value={product.code} />
            <Detail label="Category" value={product.categoryRecord.name} />
            <Detail label="Unit" value={product.productUnit} />
            <Detail label="Warehouse" value={warehouse.name} />
            <Detail
              label="Location"
              value={[warehouse.city, warehouse.country].filter(Boolean).join(", ") || "—"}
            />
            <Detail label="On-hand quantity" value={quantity} />
            <Detail
              label="Stock alert"
              value={product.stockAlert?.toString() ?? "Not set"}
            />
            <Detail
              label="Availability status"
              value={stockStatusLabels[status]}
              status={status}
            />
          </dl>
        </section>
      </main>
    </DashboardLayout>
  );
}

function Detail({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status?: StockStatus;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {status ? (
          <span className={`stock-status stock-status--${status}`}>{value}</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

const stockStatusLabels: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
};
