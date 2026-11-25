import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
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

  const [units, stocks, priorReturns] = await Promise.all([
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    db.productStock.findMany({
      where: {
        warehouseId: sale.warehouseId,
        productId: { in: sale.items.map((item) => item.productId) },
        status: "Received",
      },
      select: { productId: true, quantity: true, reservedQuantity: true },
    }),
    db.saleReturn.findMany({
      where: { saleId: sale.id, deletedAt: null },
      select: {
        items: { select: { productId: true, quantity: true, stockConversionFactor: true } },
      },
    }),
  ]);
  const stockByProductId = new Map(stocks.map((stock) => [
    stock.productId,
    stock.quantity.minus(stock.reservedQuantity),
  ]));
  const soldByProductId = new Map<string, Prisma.Decimal>();
  const returnedByProductId = new Map<string, Prisma.Decimal>();
  for (const item of sale.items) {
    soldByProductId.set(
      item.productId,
      (soldByProductId.get(item.productId) ?? new Prisma.Decimal(0))
        .plus(item.quantity.times(item.stockConversionFactor)),
    );
  }
  for (const saleReturn of priorReturns) {
    for (const item of saleReturn.items) {
      returnedByProductId.set(
        item.productId,
        (returnedByProductId.get(item.productId) ?? new Prisma.Decimal(0))
          .plus(item.quantity.times(item.stockConversionFactor)),
      );
    }
  }
  const initialData: SaleReturnFormInitialData = {
    saleId: sale.id,
    saleReference: sale.reference,
    customerName: sale.customer.name,
    warehouseName: sale.warehouse.name,
    orderTax: sale.orderTax.toString(),
      items: sale.items.map((item) => {
        const maxStockQuantity = Prisma.Decimal.max(
          (soldByProductId.get(item.productId) ?? new Prisma.Decimal(0))
            .minus(returnedByProductId.get(item.productId) ?? new Prisma.Decimal(0)),
          new Prisma.Decimal(0),
        );
        const currentUnitOptions = [
          { name: item.product.productUnit, factor: "1" },
          ...item.product.unitConversions.map((conversion) => ({
            name: conversion.unit.name,
            factor: conversion.conversionFactor.toString(),
          })),
        ];
        const unitOptions = [
          ...currentUnitOptions.filter((option) => option.name !== item.unit),
          { name: item.unit, factor: item.stockConversionFactor.toString() },
        ];
        const factor = item.stockConversionFactor.toString();
        const maxQuantity = maxStockQuantity.div(factor).times(1000).floor().div(1000).toString();
        return {
          id: item.productId,
          code: item.product.code,
          name: item.product.name,
          price: item.netUnitPrice.toString(),
          unit: item.unit,
          unitOptions,
          stock: stockByProductId.get(item.productId)?.toString() ?? "0",
          quantity: maxQuantity,
          maxQuantity,
          maxStockQuantity: maxStockQuantity.toString(),
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
