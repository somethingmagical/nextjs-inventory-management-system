import type { Metadata } from "next";
import CustomerSourcesChart from "@/components/dashboard/CustomerSourcesChart";
import DashboardCard, { KpiGrid } from "@/components/dashboard/DashboardCard";
import { WeeklySalesChart } from "@/components/dashboard/DashboardCharts";
import RecentSalesTable from "@/components/dashboard/RecentSalesTable";
import StockAlertTable from "@/components/dashboard/StockAlertTable";
import TopProductsChart, { TopProductsTable } from "@/components/dashboard/TopProductsChart";
import { Icon } from "@/components/layout/Sidebar";
import { requirePermission } from "@/lib/authorization";
import { db } from "@/lib/db";
import { PERMISSION } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Inventory Dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <div className="dash-section-gap">
            <p className="gg-muted">Loading dashboard...</p>
          </div>
        </main>
      }
    >
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  await connection();
  const access = await requirePermission(PERMISSION.viewDashboard);
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") notFound();

  const today = new Date();
  const startOfToday = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  ));
  const startOfTomorrow = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + 1,
  ));
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 6);
  const startOfYear = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const startOfNextYear = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));
  const startOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const startOfNextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const currentMonth = today.toLocaleString("en", { month: "long", timeZone: "UTC" });

  const [
    sales,
    purchases,
    salesReturns,
    purchaseReturns,
    todaySales,
    todayReceived,
    todayPurchases,
    todayExpenses,
    weeklySales,
    weeklyPurchases,
    yearlyProductSales,
    currentMonthProductSales,
    currentMonthCustomerSales,
    recentSales,
    stockAlerts,
  ] = await Promise.all([
    db.sale.aggregate({
      where: { deletedAt: null, status: "Received" },
      _sum: { grandTotal: true },
    }),
    db.purchase.aggregate({
      where: { deletedAt: null, status: "Received" },
      _sum: { grandTotal: true },
    }),
    db.saleReturn.aggregate({
      where: { deletedAt: null, status: "Received" },
      _sum: { grandTotal: true },
    }),
    db.purchaseReturn.aggregate({
      where: { deletedAt: null, status: "Received" },
      _sum: { grandTotal: true },
    }),
    db.sale.aggregate({
      where: {
        deletedAt: null,
        status: "Received",
        date: { gte: startOfToday, lt: startOfTomorrow },
      },
      _sum: { grandTotal: true },
    }),
    db.salePayment.aggregate({
      where: {
        date: { gte: startOfToday, lt: startOfTomorrow },
        sale: { is: { deletedAt: null, status: "Received" } },
      },
      _sum: { amount: true },
    }),
    db.purchase.aggregate({
      where: {
        deletedAt: null,
        status: "Received",
        date: { gte: startOfToday, lt: startOfTomorrow },
      },
      _sum: { grandTotal: true },
    }),
    db.expense.aggregate({
      where: {
        deletedAt: null,
        date: { gte: startOfToday, lt: startOfTomorrow },
      },
      _sum: { amount: true },
    }),
    db.sale.groupBy({
      by: ["date"],
      where: {
        deletedAt: null,
        status: "Received",
        date: { gte: startOfWeek, lt: startOfTomorrow },
      },
      _sum: { grandTotal: true },
    }),
    db.purchase.groupBy({
      by: ["date"],
      where: {
        deletedAt: null,
        status: "Received",
        date: { gte: startOfWeek, lt: startOfTomorrow },
      },
      _sum: { grandTotal: true },
    }),
    db.saleItem.groupBy({
      by: ["productId"],
      where: {
        sale: {
          is: {
            deletedAt: null,
            status: "Received",
            date: { gte: startOfYear, lt: startOfNextYear },
          },
        },
        product: { is: { deletedAt: null } },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 5,
    }),
    db.saleItem.groupBy({
      by: ["productId"],
      where: {
        sale: {
          is: {
            deletedAt: null,
            status: "Received",
            date: { gte: startOfMonth, lt: startOfNextMonth },
          },
        },
        product: { is: { deletedAt: null } },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: 5,
    }),
    db.sale.groupBy({
      by: ["customerId"],
      where: {
        deletedAt: null,
        status: "Received",
        date: { gte: startOfMonth, lt: startOfNextMonth },
        customer: { is: { deletedAt: null } },
      },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: "desc" } },
      take: 5,
    }),
    db.sale.findMany({
      where: { deletedAt: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        reference: true,
        status: true,
        grandTotal: true,
        paid: true,
        due: true,
        paymentStatus: true,
        customer: { select: { name: true } },
      },
    }),
    db.$queryRaw<{
      id: string;
      code: string;
      product: string;
      warehouse: string;
      quantity: Prisma.Decimal;
      alertQuantity: Prisma.Decimal;
      unit: string;
    }[]>`
      SELECT
        ps.id AS id,
        p.code AS code,
        p.name AS product,
        w.name AS warehouse,
        ps.quantity AS quantity,
        p.stockAlert AS alertQuantity,
        p.productUnit AS unit
      FROM ProductStock AS ps
      INNER JOIN Product AS p
        ON p.id = ps.productId AND p.deletedAt IS NULL
      INNER JOIN Warehouse AS w
        ON w.id = ps.warehouseId AND w.deletedAt IS NULL
      WHERE p.stockAlert IS NOT NULL AND ps.quantity <= p.stockAlert
      ORDER BY p.name ASC, w.name ASC
      LIMIT 5
    `,
  ]);

  const productIds = [...new Set([
    ...yearlyProductSales.map(({ productId }) => productId),
    ...currentMonthProductSales.map(({ productId }) => productId),
  ])];
  const customerIds = currentMonthCustomerSales.map(({ customerId }) => customerId);
  const [products, customers] = await Promise.all([
    productIds.length
      ? db.product.findMany({
          where: { id: { in: productIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    customerIds.length
      ? db.customer.findMany({
          where: { id: { in: customerIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const productNameById = new Map(products.map(({ id, name }) => [id, name]));
  const customerNameById = new Map(customers.map(({ id, name }) => [id, name]));
  const yearlyProducts = yearlyProductSales.flatMap((item) => {
    const name = productNameById.get(item.productId);
    if (!name) return [];
    return [{
      name,
      quantity: item._sum.quantity?.toString() ?? "0",
      revenue: item._sum.subtotal?.toFixed(2) ?? "0.00",
    }];
  });
  const currentMonthProducts = currentMonthProductSales.flatMap((item) => {
    const name = productNameById.get(item.productId);
    if (!name) return [];
    return [{
      name,
      quantity: item._sum.quantity?.toString() ?? "0",
      revenue: item._sum.subtotal?.toFixed(2) ?? "0.00",
    }];
  });
  const topCustomers = currentMonthCustomerSales.flatMap((item) => {
    const name = customerNameById.get(item.customerId);
    if (!name) return [];
    return [{
      name,
      amount: item._sum.grandTotal?.toFixed(2) ?? "0.00",
    }];
  });
  const saleTotalsByDay = new Map(
    weeklySales.map(({ date, _sum }) => [
      date.toISOString().slice(0, 10),
      _sum.grandTotal?.toNumber() ?? 0,
    ]),
  );
  const purchaseTotalsByDay = new Map(
    weeklyPurchases.map(({ date, _sum }) => [
      date.toISOString().slice(0, 10),
      _sum.grandTotal?.toNumber() ?? 0,
    ]),
  );
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfWeek);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      label: date.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      sales: saleTotalsByDay.get(key) ?? 0,
      purchases: purchaseTotalsByDay.get(key) ?? 0,
    };
  });

  const kpiValues = {
    sales: sales._sum.grandTotal?.toFixed(2) ?? "0.00",
    purchases: purchases._sum.grandTotal?.toFixed(2) ?? "0.00",
    salesReturns: salesReturns._sum.grandTotal?.toFixed(2) ?? "0.00",
    purchaseReturns: purchaseReturns._sum.grandTotal?.toFixed(2) ?? "0.00",
    todaySales: todaySales._sum.grandTotal?.toFixed(2) ?? "0.00",
    todayReceived: todayReceived._sum.amount?.toFixed(2) ?? "0.00",
    todayPurchases: todayPurchases._sum.grandTotal?.toFixed(2) ?? "0.00",
    todayExpenses: todayExpenses._sum.amount?.toFixed(2) ?? "0.00",
  };

  return (
    <main className="gg-content">
      <div className="dash-section-gap">
        <KpiGrid values={kpiValues} />

        <section className="dash-2col" aria-label="Sales and customer reports">
          <div className="dash-col">
            <DashboardCard
              title="This Week Sales & Purchases"
              action={
                <button className="gg-icon-btn dashboard-more-button" type="button" aria-label="More chart options">
                  <Icon name="menu" size={16} />
                </button>
              }
            >
              <WeeklySalesChart
                labels={weekDays.map(({ label }) => label)}
                sales={weekDays.map(({ sales: amount }) => amount)}
                purchases={weekDays.map(({ purchases: amount }) => amount)}
              />
            </DashboardCard>
            <TopProductsTable month={currentMonth} products={currentMonthProducts} />
          </div>

          <div className="dash-col">
            <TopProductsChart year={today.getUTCFullYear()} products={yearlyProducts} />
            <CustomerSourcesChart month={currentMonth} customers={topCustomers} />
          </div>
        </section>

        <RecentSalesTable
          sales={recentSales.map((sale) => ({
            id: sale.id,
            reference: sale.reference,
            customer: sale.customer.name,
            status: sale.status,
            grandTotal: sale.grandTotal.toFixed(2),
            paid: sale.paid.toFixed(2),
            due: sale.due.toFixed(2),
            paymentStatus: sale.paymentStatus,
          }))}
        />
        <StockAlertTable
          stockAlerts={stockAlerts.map((stock) => ({
            id: stock.id,
            code: stock.code,
            product: stock.product,
            warehouse: stock.warehouse,
            quantity: stock.quantity.toString(),
            alertQuantity: stock.alertQuantity.toString(),
            unit: stock.unit,
          }))}
          stockHref={
            access.user.roleName === "admin"
              || access.user.permissions.includes(PERMISSION.viewStock)
              ? "/stock"
              : undefined
          }
        />
      </div>
    </main>
  );
}
