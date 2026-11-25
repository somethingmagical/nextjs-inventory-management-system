import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PurchaseForm, {
  type PurchaseFormInitialData,
} from "@/components/purchases/PurchaseForm";
import { db } from "@/lib/db";
import { getPurchaseAccess } from "../../authorization";
import { purchaseIdSchema } from "../../purchase-create-schema";

export const metadata: Metadata = {
  title: "Edit Purchase",
  description: "Edit a supplier purchase",
};

type EditPurchasePageProps = {
  params: Promise<{ id: string }>;
};

export default function EditPurchasePage({ params }: EditPurchasePageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading purchase...</p>
        </main>
      }
    >
      <AuthorizedEditPurchasePage params={params} />
    </Suspense>
  );
}

async function AuthorizedEditPurchasePage({ params }: EditPurchasePageProps) {
  await connection();
  const access = await getPurchaseAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = purchaseIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const purchase = await db.purchase.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      date: true,
      warehouseId: true,
      supplierId: true,
      status: true,
      orderTax: true,
      discount: true,
      shipping: true,
      notes: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productId: true,
          netUnitCost: true,
          quantity: true,
          stockConversionFactor: true,
          unit: true,
          discountType: true,
          discount: true,
          taxType: true,
          orderTax: true,
          product: {
            select: {
              code: true,
              name: true,
              productUnit: true,
              unitConversions: {
                where: { unit: { deletedAt: null } },
                select: { conversionFactor: true, unit: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!purchase) notFound();

  const productIds = purchase.items.map((item) => item.productId);
  const [warehouses, suppliers, units, stocks] = await Promise.all([
    db.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.supplier.findMany({
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
      where: {
        warehouseId: purchase.warehouseId,
        productId: { in: productIds },
        status: "Received",
      },
      select: { productId: true, quantity: true },
    }),
  ]);
  const stockByProductId = new Map(
    stocks.map((stock) => [stock.productId, stock.quantity]),
  );
  const initialData: PurchaseFormInitialData = {
    id: purchase.id,
    date: purchase.date.toISOString().slice(0, 10),
    warehouseId: purchase.warehouseId,
    supplierId: purchase.supplierId,
    status: purchase.status,
    orderTax: purchase.orderTax.toString(),
    discount: purchase.discount.toString(),
    shipping: purchase.shipping.toString(),
    notes: purchase.notes,
    items: purchase.items.map((item) => ({
      id: item.productId,
      code: item.product.code,
      name: item.product.name,
      netUnitCost: item.netUnitCost.toString(),
      unit: item.unit,
      stockUnit: item.product.productUnit,
      unitOptions: [
        { name: item.product.productUnit, factor: "1" },
        ...item.product.unitConversions.map((conversion) => ({
          name: conversion.unit.name,
          factor: conversion.conversionFactor.toString(),
        })),
      ],
      stock: (
        stockByProductId.get(item.productId) ??
        item.quantity.minus(item.quantity)
      )
        .plus(purchase.status === "Received"
          ? item.quantity.times(item.stockConversionFactor)
          : 0)
        .toString(),
      quantity: item.quantity.toString(),
      discountType: item.discountType,
      discount: item.discount.toString(),
      taxType: item.taxType,
      orderTax: item.orderTax.toString(),
    })),
  };
  const displayName =
    `${access.user.firstName} ${access.user.lastName}`.trim() ||
    access.user.email;

  return (
    <DashboardLayout
      user={{ name: displayName, image: access.user.image }}
      pageTitle="Purchases"
    >
      <PurchaseForm
        warehouses={warehouses}
        suppliers={suppliers}
        units={units.map((unit) => unit.name)}
        initialData={initialData}
        isEditing
      />
    </DashboardLayout>
  );
}
