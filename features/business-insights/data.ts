import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildBusinessInsightFacts, getBusinessInsightPeriods } from "./facts";

function decimalOrZero(value: Prisma.Decimal | null): Prisma.Decimal {
  return value ?? new Prisma.Decimal(0);
}

export async function getBusinessInsightFacts(now = new Date()) {
  const periods = getBusinessInsightPeriods(now);
  const [currentSales, previousSales, currentReturns, previousReturns, currentExpenses, previousExpenses, receivables, lowStock] =
    await Promise.all([
      db.sale.aggregate({
        where: {
          deletedAt: null,
          status: "Received",
          date: { gte: periods.current.start, lt: periods.current.end },
        },
        _sum: { grandTotal: true },
      }),
      db.sale.aggregate({
        where: {
          deletedAt: null,
          status: "Received",
          date: { gte: periods.previous.start, lt: periods.previous.end },
        },
        _sum: { grandTotal: true },
      }),
      db.saleReturn.aggregate({
        where: {
          deletedAt: null,
          status: "Received",
          date: { gte: periods.current.start, lt: periods.current.end },
        },
        _sum: { grandTotal: true },
      }),
      db.saleReturn.aggregate({
        where: {
          deletedAt: null,
          status: "Received",
          date: { gte: periods.previous.start, lt: periods.previous.end },
        },
        _sum: { grandTotal: true },
      }),
      db.expense.aggregate({
        where: {
          deletedAt: null,
          date: { gte: periods.current.start, lt: periods.current.end },
        },
        _sum: { amount: true },
      }),
      db.expense.aggregate({
        where: {
          deletedAt: null,
          date: { gte: periods.previous.start, lt: periods.previous.end },
        },
        _sum: { amount: true },
      }),
      db.sale.aggregate({
        where: {
          deletedAt: null,
          status: "Received",
          due: { gt: 0 },
        },
        _sum: { due: true },
      }),
      db.$queryRaw<Array<{ positionCount: bigint }>>`
        SELECT COUNT(*) AS positionCount
        FROM ProductStock AS ps
        INNER JOIN Product AS p
          ON p.id = ps.productId AND p.deletedAt IS NULL
        INNER JOIN Warehouse AS w
          ON w.id = ps.warehouseId AND w.deletedAt IS NULL
        WHERE ps.status = 'Received'
          AND p.stockAlert IS NOT NULL
          AND ps.quantity - ps.reservedQuantity <= p.stockAlert
      `,
    ]);

  const currentSalesAfterReturns = decimalOrZero(currentSales._sum.grandTotal)
    .minus(decimalOrZero(currentReturns._sum.grandTotal));
  const previousSalesAfterReturns = decimalOrZero(previousSales._sum.grandTotal)
    .minus(decimalOrZero(previousReturns._sum.grandTotal));
  const facts = buildBusinessInsightFacts({
    sales: {
      current: currentSalesAfterReturns.toFixed(2),
      previous: previousSalesAfterReturns.toFixed(2),
    },
    expenses: {
      current: decimalOrZero(currentExpenses._sum.amount).toFixed(2),
      previous: decimalOrZero(previousExpenses._sum.amount).toFixed(2),
    },
    receivables: decimalOrZero(receivables._sum.due).toFixed(2),
    lowStockPositions: Number(lowStock[0]?.positionCount ?? 0),
    periods,
  });

  return { facts, periods };
}
