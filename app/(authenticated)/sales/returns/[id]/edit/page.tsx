import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SaleReturnForm, { type SaleReturnFormInitialData } from "@/components/sales/SaleReturnForm";
import { db } from "@/lib/db";
import { getSaleReturnAccess } from "../../../authorization";
import { getSaleReturnDetails } from "../../sale-return-details";
import { saleReturnIdSchema } from "../../sale-return-schema";

export const metadata: Metadata = {
  title: "Edit Sale Return",
  description: "Edit returned items and refund details",
};

type EditSaleReturnPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditSaleReturnPage({ params }: EditSaleReturnPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale return...</p>
        </main>
      }
    >
      <AuthorizedEditSaleReturnPage params={params} />
    </Suspense>
  );
}

async function AuthorizedEditSaleReturnPage({ params }: EditSaleReturnPageProps) {
  await connection();
  const access = await getSaleReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = saleReturnIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const saleReturn = await getSaleReturnDetails(parsedId.data);
  if (!saleReturn?.sale || saleReturn.sale.deletedAt) notFound();

  const [sale, priorReturns, units, stocks] = await Promise.all([
    db.sale.findFirst({
      where: { id: saleReturn.sale.id, deletedAt: null },
      select: {
        items: {
          select: { productId: true, quantity: true },
        },
      },
    }),
    db.saleReturn.findMany({
      where: {
        saleId: saleReturn.sale.id,
        deletedAt: null,
        id: { not: saleReturn.id },
      },
      select: { items: { select: { productId: true, quantity: true } } },
    }),
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    db.productStock.findMany({
      where: {
        warehouseId: saleReturn.warehouseId,
        productId: { in: saleReturn.items.map((item) => item.product.id) },
      },
      select: { productId: true, quantity: true },
    }),
  ]);
  if (!sale) notFound();

  const soldByProductId = new Map<string, Prisma.Decimal>();
  for (const item of sale.items) {
    soldByProductId.set(
      item.productId,
      (soldByProductId.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity),
    );
  }
  const returnedByOtherDocuments = new Map<string, Prisma.Decimal>();
  for (const otherReturn of priorReturns) {
    for (const item of otherReturn.items) {
      returnedByOtherDocuments.set(
        item.productId,
        (returnedByOtherDocuments.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity),
      );
    }
  }
  const stockByProductId = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
  const initialData: SaleReturnFormInitialData = {
    id: saleReturn.id,
    saleId: saleReturn.sale.id,
    saleReference: saleReturn.sale.reference,
    customerName: saleReturn.customer.name,
    warehouseName: saleReturn.warehouse?.name ?? "Warehouse unavailable",
    date: saleReturn.date.toISOString().slice(0, 10),
    status: saleReturn.status,
    orderTax: saleReturn.orderTax.toString(),
    discount: saleReturn.discount.toString(),
    shipping: saleReturn.shipping.toString(),
    notes: saleReturn.notes,
    items: saleReturn.items.map((item) => {
      const maxQuantity = Prisma.Decimal.max(
        (soldByProductId.get(item.product.id) ?? new Prisma.Decimal(0))
          .minus(returnedByOtherDocuments.get(item.product.id) ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );
      return {
        id: item.product.id,
        code: item.product.code,
        name: item.product.name,
        price: item.netUnitPrice.toString(),
        unit: item.unit,
        stock: stockByProductId.get(item.product.id)?.toString() ?? "0",
        quantity: item.quantity.toString(),
        maxQuantity: maxQuantity.toString(),
        discountType: item.discountType,
        discount: item.discount.toString(),
        taxType: item.taxType,
        orderTax: item.orderTax.toString(),
      };
    }),
  };
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales Returns">
      <main className="gg-content">
        <div className="page-head">
          <h1 className="gg-page-title">Edit Sale Return</h1>
          <Link className="gg-btn gg-btn--secondary" href={`/sales/returns/${encodeURIComponent(saleReturn.id)}`}>
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </div>
        <SaleReturnForm units={units.map((unit) => unit.name)} initialData={initialData} />
      </main>
    </DashboardLayout>
  );
}
