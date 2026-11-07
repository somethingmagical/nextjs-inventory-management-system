import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SaleForm, { type SaleFormInitialData } from "@/components/sales/SaleForm";
import { db } from "@/lib/db";
import { getSaleAccess } from "../../authorization";
import { saleIdSchema } from "../payments/payment-schema";

export const metadata: Metadata = {
  title: "Edit Sale",
  description: "Edit a customer sale",
};

type EditSalePageProps = {
  params: Promise<{ id: string }>;
};

export default function EditSalePage({ params }: EditSalePageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale...</p>
        </main>
      }
    >
      <AuthorizedEditSalePage params={params} />
    </Suspense>
  );
}

async function AuthorizedEditSalePage({ params }: EditSalePageProps) {
  await connection();
  const access = await getSaleAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = saleIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const sale = await db.sale.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      date: true,
      warehouseId: true,
      customerId: true,
      status: true,
      orderTax: true,
      discount: true,
      shipping: true,
      paymentType: true,
      notes: true,
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
  if (!sale) notFound();

  const productIds = sale.items.map((item) => item.productId);
  const [warehouses, customers, units, stocks, payments] = await Promise.all([
    db.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    db.productStock.findMany({
      where: { warehouseId: sale.warehouseId, productId: { in: productIds } },
      select: { productId: true, quantity: true },
    }),
    db.salePayment.aggregate({
      where: { saleId: sale.id },
      _sum: { amount: true },
    }),
  ]);
  const stockByProductId = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
  const initialData: SaleFormInitialData = {
    id: sale.id,
    date: sale.date.toISOString().slice(0, 10),
    warehouseId: sale.warehouseId,
    customerId: sale.customerId,
    status: sale.status,
    orderTax: sale.orderTax.toString(),
    discount: sale.discount.toString(),
    shipping: sale.shipping.toString(),
    paid: payments._sum.amount?.toString() ?? "0.00",
    paymentType: sale.paymentType,
    notes: sale.notes,
    items: sale.items.map((item) => ({
      id: item.productId,
      code: item.product.code,
      name: item.product.name,
      price: item.netUnitPrice.toString(),
      unit: item.unit,
      stock: (stockByProductId.get(item.productId)?.plus(item.quantity) ?? item.quantity).toString(),
      quantity: item.quantity.toString(),
      discountType: item.discountType,
      discount: item.discount.toString(),
      taxType: item.taxType,
      orderTax: item.orderTax.toString(),
    })),
  };
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales">
      <main className="gg-content">
        <div className="page-head">
          <h1 className="gg-page-title">Edit Sale</h1>
          <Link className="gg-btn gg-btn--secondary" href={`/sales/${encodeURIComponent(sale.id)}`}>
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </div>
        <SaleForm
          warehouses={warehouses}
          customers={customers}
          units={units.map((unit) => unit.name)}
          defaultCustomerId={sale.customerId}
          initialData={initialData}
        />
      </main>
    </DashboardLayout>
  );
}
