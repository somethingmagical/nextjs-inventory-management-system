import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SaleReturnForm, { type SaleReturnFormInitialData } from "@/components/sales/SaleReturnForm";
import { db } from "@/lib/db";
import { getSaleReturnAccess } from "../../authorization";

export const metadata: Metadata = {
  title: "Create Sale Return",
  description: "Return items from a customer sale",
};

const saleIdSchema = z.string().trim().min(1).max(191);

type CreateSaleReturnPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CreateSaleReturnPage({ searchParams }: CreateSaleReturnPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale return form...</p>
        </main>
      }
    >
      <AuthorizedCreateSaleReturnPage searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthorizedCreateSaleReturnPage({ searchParams }: CreateSaleReturnPageProps) {
  await connection();
  const access = await getSaleReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const query = await searchParams;
  const parsedSaleId = saleIdSchema.safeParse(query.saleId);
  if (!parsedSaleId.success) notFound();

  const sale = await db.sale.findFirst({
    where: { id: parsedSaleId.data, deletedAt: null },
    select: {
      id: true,
      reference: true,
      customerId: true,
      warehouseId: true,
      orderTax: true,
      customer: { select: { name: true, deletedAt: true } },
      warehouse: { select: { name: true, deletedAt: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productId: true,
          netUnitPrice: true,
          quantity: true,
          unit: true,
          discountType: true,
          discount: true,
          taxType: true,
          orderTax: true,
          product: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!sale || !sale.customer || sale.customer.deletedAt || sale.items.length === 0) notFound();
  if (!sale.warehouse || sale.warehouse.deletedAt) {
    const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

    return (
      <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales Returns">
        <main className="gg-content">
          <div className="page-head">
            <h1 className="gg-page-title">Create Sale Return</h1>
            <Link className="gg-btn gg-btn--secondary" href="/sales">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
          </div>
          <p className="warehouse-toast is-visible" role="alert">
            This sale cannot be returned because its warehouse is unavailable.
          </p>
        </main>
      </DashboardLayout>
    );
  }

  const [units, stocks] = await Promise.all([
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    db.productStock.findMany({
      where: {
        warehouseId: sale.warehouseId,
        productId: { in: sale.items.map((item) => item.productId) },
      },
      select: { productId: true, quantity: true },
    }),
  ]);
  const stockByProductId = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
  const initialData: SaleReturnFormInitialData = {
    saleId: sale.id,
    saleReference: sale.reference,
    customerName: sale.customer.name,
    warehouseName: sale.warehouse.name,
    orderTax: sale.orderTax.toString(),
    items: sale.items.map((item) => ({
      id: item.productId,
      code: item.product.code,
      name: item.product.name,
      price: item.netUnitPrice.toString(),
      unit: item.unit,
      stock: stockByProductId.get(item.productId)?.toString() ?? "0",
      quantity: item.quantity.toString(),
      maxQuantity: item.quantity.toString(),
      discountType: item.discountType,
      discount: item.discount.toString(),
      taxType: item.taxType,
      orderTax: item.orderTax.toString(),
    })),
  };
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales Returns">
      <main className="gg-content">
        <div className="page-head">
          <h1 className="gg-page-title">Create Sale Return</h1>
          <Link className="gg-btn gg-btn--secondary" href="/sales">
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </div>
        <SaleReturnForm
          units={units.map((unit) => unit.name)}
          initialData={initialData}
        />
      </main>
    </DashboardLayout>
  );
}
