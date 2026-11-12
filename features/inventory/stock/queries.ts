import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  classifyStockStatus,
  type StockStatus,
  type StockStatusFilter,
} from "./policy";

export type StockWarehouseSummary = {
  id: string;
  name: string;
  city: string;
  region: string | null;
  country: string;
  productCount: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export async function getStockWarehouseOverview(): Promise<StockWarehouseSummary[]> {
  const rows = await db.$queryRaw<Array<{
    id: string;
    name: string;
    city: string;
    region: string | null;
    country: string;
    productCount: bigint;
    inStockCount: bigint;
    lowStockCount: bigint;
    outOfStockCount: bigint;
  }>>`
    SELECT
      w.\`id\`,
      w.\`name\`,
      w.\`city\`,
      w.\`region\`,
      w.\`country\`,
      COALESCE(products.\`productCount\`, 0) AS \`productCount\`,
      COUNT(CASE
        WHEN p.\`id\` IS NOT NULL AND c.\`id\` IS NOT NULL
          AND ps.\`quantity\` > 0
          AND (p.\`stockAlert\` IS NULL OR ps.\`quantity\` > p.\`stockAlert\`)
        THEN 1
      END) AS \`inStockCount\`,
      COUNT(CASE
        WHEN p.\`id\` IS NOT NULL AND c.\`id\` IS NOT NULL
          AND ps.\`quantity\` > 0
          AND p.\`stockAlert\` IS NOT NULL
          AND ps.\`quantity\` <= p.\`stockAlert\`
        THEN 1
      END) AS \`lowStockCount\`,
      COALESCE(products.\`productCount\`, 0) - COUNT(CASE
        WHEN p.\`id\` IS NOT NULL AND c.\`id\` IS NOT NULL AND ps.\`quantity\` > 0
        THEN 1
      END) AS \`outOfStockCount\`
    FROM \`Warehouse\` w
    CROSS JOIN (
      SELECT COUNT(*) AS \`productCount\`
      FROM \`Product\` activeProduct
      INNER JOIN \`Category\` activeCategory
        ON activeCategory.\`id\` = activeProduct.\`categoryId\`
      WHERE activeProduct.\`deletedAt\` IS NULL
        AND activeCategory.\`deletedAt\` IS NULL
    ) products
    LEFT JOIN \`ProductStock\` ps ON ps.\`warehouseId\` = w.\`id\`
    LEFT JOIN \`Product\` p
      ON p.\`id\` = ps.\`productId\` AND p.\`deletedAt\` IS NULL
    LEFT JOIN \`Category\` c
      ON c.\`id\` = p.\`categoryId\` AND c.\`deletedAt\` IS NULL
    WHERE w.\`deletedAt\` IS NULL
    GROUP BY w.\`id\`, w.\`name\`, w.\`city\`, w.\`region\`, w.\`country\`, products.\`productCount\`
    ORDER BY w.\`name\` ASC
  `;

  return rows.map((row) => ({
    ...row,
    productCount: Number(row.productCount),
    inStockCount: Number(row.inStockCount),
    lowStockCount: Number(row.lowStockCount),
    outOfStockCount: Number(row.outOfStockCount),
  }));
}

export async function getStockCategoryOptions() {
  return db.category.findMany({
    where: { deletedAt: null, products: { some: { deletedAt: null } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type WarehouseStockItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  productUnit: string;
  quantity: string;
  stockAlert: string | null;
  status: StockStatus;
};

export async function getWarehouseStockData(input: {
  warehouseId: string;
  query: string;
  categoryId: string;
  status: StockStatusFilter;
  requestedPage: number;
  pageSize: number;
  sortBy: "code" | "name" | "category" | "quantity" | "stockAlert";
  sortOrder: "asc" | "desc";
}) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.\`deletedAt\` IS NULL`,
    Prisma.sql`c.\`deletedAt\` IS NULL`,
  ];

  if (input.query) {
    conditions.push(Prisma.sql`(
      p.\`code\` LIKE CONCAT('%', ${input.query}, '%')
      OR p.\`name\` LIKE CONCAT('%', ${input.query}, '%')
      OR c.\`name\` LIKE CONCAT('%', ${input.query}, '%')
    )`);
  }
  if (input.categoryId) {
    conditions.push(Prisma.sql`p.\`categoryId\` = ${input.categoryId}`);
  }
  if (input.status === "in-stock") {
    conditions.push(Prisma.sql`COALESCE(ps.\`quantity\`, 0) > 0 AND (
      p.\`stockAlert\` IS NULL OR COALESCE(ps.\`quantity\`, 0) > p.\`stockAlert\`
    )`);
  } else if (input.status === "low-stock") {
    conditions.push(Prisma.sql`COALESCE(ps.\`quantity\`, 0) > 0
      AND p.\`stockAlert\` IS NOT NULL
      AND COALESCE(ps.\`quantity\`, 0) <= p.\`stockAlert\``);
  } else if (input.status === "out-of-stock") {
    conditions.push(Prisma.sql`COALESCE(ps.\`quantity\`, 0) <= 0`);
  }

  const where = Prisma.join(conditions, " AND ");
  const countRows = await db.$queryRaw<Array<{ totalCount: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) AS \`totalCount\`
      FROM \`Product\` p
      INNER JOIN \`Category\` c ON c.\`id\` = p.\`categoryId\`
      LEFT JOIN \`ProductStock\` ps
        ON ps.\`productId\` = p.\`id\` AND ps.\`warehouseId\` = ${input.warehouseId}
      WHERE ${where}
    `,
  );
  const totalCount = Number(countRows[0]?.totalCount ?? BigInt(0));
  const totalPages = Math.ceil(totalCount / input.pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(input.requestedPage, totalPages);
  const sortColumn = {
    code: Prisma.sql`p.\`code\``,
    name: Prisma.sql`p.\`name\``,
    category: Prisma.sql`c.\`name\``,
    quantity: Prisma.sql`COALESCE(ps.\`quantity\`, 0)`,
    stockAlert: Prisma.sql`p.\`stockAlert\``,
  }[input.sortBy];
  const sortDirection = input.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const rows = await db.$queryRaw<Array<{
    id: string;
    code: string;
    name: string;
    category: string;
    productUnit: string;
    quantity: string;
    stockAlert: string | null;
  }>>(Prisma.sql`
    SELECT
      p.\`id\`,
      p.\`code\`,
      p.\`name\`,
      c.\`name\` AS \`category\`,
      p.\`productUnit\`,
      CAST(COALESCE(ps.\`quantity\`, 0) AS CHAR) AS \`quantity\`,
      CAST(p.\`stockAlert\` AS CHAR) AS \`stockAlert\`
    FROM \`Product\` p
    INNER JOIN \`Category\` c ON c.\`id\` = p.\`categoryId\`
    LEFT JOIN \`ProductStock\` ps
      ON ps.\`productId\` = p.\`id\` AND ps.\`warehouseId\` = ${input.warehouseId}
    WHERE ${where}
    ORDER BY ${sortColumn} ${sortDirection}, p.\`id\` ASC
    LIMIT ${input.pageSize} OFFSET ${(currentPage - 1) * input.pageSize}
  `);

  const items = rows.map((row) => ({
    ...row,
    status: classifyStockStatus(row.quantity, row.stockAlert),
  }));

  return { totalCount, totalPages, currentPage, items };
}
