import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { classifyStockStatus, type StockStatus } from "@/features/inventory/stock/policy";
import { getAdjustmentAccess } from "../../../adjustments/authorization";
import StockQuantityEditForm from "./StockQuantityEditForm";
import { updateWarehouseStockQuantity } from "./actions";

export const metadata: Metadata = {
  title: "Edit Warehouse Stock",
  description: "Update the on-hand quantity for a product in a warehouse.",
};

const idSchema = z.string().trim().min(1).max(191);

type StockQuantityEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function StockQuantityEditPage({
  params,
  searchParams,
}: StockQuantityEditPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading warehouse stock...</p>
        </main>
      }
    >
      <StockQuantityEditPageContent
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function StockQuantityEditPageContent({
  params,
  searchParams,
}: StockQuantityEditPageProps) {
  await connection();
  const access = await getAdjustmentAccess();
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
  const currentQuantity = stock?.quantity ?? new Prisma.Decimal(0);
  const currentQuantityText = currentQuantity.toString();
  const status = classifyStockStatus(
    currentQuantityText,
    product.stockAlert?.toString() ?? null,
  );
  const userName =
    `${access.user.firstName} ${access.user.lastName}`.trim() ||
    access.user.email;
  const action = updateWarehouseStockQuantity.bind(
    null,
    product.id,
    warehouse.id,
  );

  return (
    <DashboardLayout
      user={{ name: userName, image: access.user.image }}
      pageTitle="Stock"
    >
      <main className="gg-content">
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Edit warehouse stock</h1>
            <p className="gg-muted">
              Update the on-hand quantity for this product and warehouse.
            </p>
          </div>
        </div>

        <section className="gg-card gg-card-pad" aria-labelledby="stock-edit-details">
          <h2 className="gg-card-title" id="stock-edit-details">
            Stock details
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

        <section aria-label="Update on-hand quantity">
          <StockQuantityEditForm
            action={action}
            expectedQuantity={currentQuantityText}
            warehouseId={warehouse.id}
          />
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
      <dt className="gg-muted">{label}</dt>
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
