import "server-only";

import { Prisma, PurchaseStatus, SalePaymentStatus } from "@prisma/client";

export const warehouseReportTabs = ["sales", "sales-returns", "purchase-returns", "expenses"] as const;
export type WarehouseReportTab = typeof warehouseReportTabs[number];

function purchaseStatusMatch(query: string) {
  return Object.values(PurchaseStatus)
    .find((status) => status.toLowerCase() === query.toLowerCase());
}

function salePaymentStatusMatch(query: string) {
  return Object.values(SalePaymentStatus)
    .find((status) => status.toLowerCase() === query.toLowerCase());
}

export function buildWarehouseSaleWhere(query: string, warehouseId?: string): Prisma.SaleWhereInput {
  const conditions: Prisma.SaleWhereInput[] = [];
  if (query) {
    conditions.push(
      { reference: { contains: query } },
      { customer: { is: { name: { contains: query } } } },
      { warehouse: { is: { name: { contains: query } } } },
    );
    const status = purchaseStatusMatch(query);
    const paymentStatus = salePaymentStatusMatch(query);
    if (status) conditions.push({ status });
    if (paymentStatus) conditions.push({ paymentStatus });
  }
  return {
    deletedAt: null,
    ...(warehouseId ? { warehouseId } : {}),
    ...(conditions.length ? { OR: conditions } : {}),
  };
}

export function buildWarehouseSaleReturnWhere(
  query: string,
  warehouseId?: string,
): Prisma.SaleReturnWhereInput {
  const conditions: Prisma.SaleReturnWhereInput[] = [];
  if (query) {
    conditions.push(
      { reference: { contains: query } },
      { customer: { is: { name: { contains: query } } } },
      { warehouse: { is: { name: { contains: query } } } },
    );
    const status = purchaseStatusMatch(query);
    const paymentStatus = salePaymentStatusMatch(query);
    if (status) conditions.push({ status });
    if (paymentStatus) conditions.push({ paymentStatus });
  }
  return {
    deletedAt: null,
    ...(warehouseId ? { warehouseId } : {}),
    ...(conditions.length ? { OR: conditions } : {}),
  };
}

export function buildWarehousePurchaseReturnWhere(
  query: string,
  warehouseId?: string,
): Prisma.PurchaseReturnWhereInput {
  const conditions: Prisma.PurchaseReturnWhereInput[] = [];
  if (query) {
    conditions.push(
      { reference: { contains: query } },
      { supplier: { is: { name: { contains: query } } } },
      { warehouse: { is: { name: { contains: query } } } },
      { paymentType: { contains: query } },
    );
    const status = purchaseStatusMatch(query);
    if (status) conditions.push({ status });
  }
  return {
    deletedAt: null,
    ...(warehouseId ? { warehouseId } : {}),
    ...(conditions.length ? { OR: conditions } : {}),
  };
}

export function buildWarehouseExpenseWhere(query: string, warehouseId?: string): Prisma.ExpenseWhereInput {
  const conditions: Prisma.ExpenseWhereInput[] = query
    ? [
        { reference: { contains: query } },
        { title: { contains: query } },
        { warehouse: { is: { name: { contains: query } } } },
        { expenseCategory: { is: { name: { contains: query } } } },
      ]
    : [];
  return {
    deletedAt: null,
    ...(warehouseId ? { warehouseId } : {}),
    ...(conditions.length ? { OR: conditions } : {}),
  };
}

export function buildSaleReportWhere(query: string, date: string): Prisma.SaleWhereInput {
  const conditions: Prisma.SaleWhereInput[] = [];
  if (query) {
    conditions.push(
      { reference: { contains: query } },
      { customer: { is: { name: { contains: query } } } },
      { warehouse: { is: { name: { contains: query } } } },
      { paymentType: { contains: query } },
    );
    const status = purchaseStatusMatch(query);
    const paymentStatus = salePaymentStatusMatch(query);
    if (status) conditions.push({ status });
    if (paymentStatus) conditions.push({ paymentStatus });
  }
  return {
    deletedAt: null,
    ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
    ...(conditions.length ? { OR: conditions } : {}),
  };
}

export function buildPurchaseReportWhere(query: string, date: string): Prisma.PurchaseWhereInput {
  const conditions: Prisma.PurchaseWhereInput[] = [];
  if (query) {
    conditions.push(
      { reference: { contains: query } },
      { supplier: { is: { name: { contains: query } } } },
      { warehouse: { is: { name: { contains: query } } } },
      { paymentType: { contains: query } },
    );
    const status = purchaseStatusMatch(query);
    if (status) conditions.push({ status });
  }
  return {
    deletedAt: null,
    ...(date ? { date: new Date(`${date}T00:00:00.000Z`) } : {}),
    ...(conditions.length ? { OR: conditions } : {}),
  };
}

export function buildStockReportWhere(query: string): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    categoryRecord: { is: { deletedAt: null } },
    ...(query
      ? {
          OR: [
            { code: { contains: query } },
            { name: { contains: query } },
            { categoryRecord: { is: { name: { contains: query }, deletedAt: null } } },
          ],
        }
      : {}),
  };
}
