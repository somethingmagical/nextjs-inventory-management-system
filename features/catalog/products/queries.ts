import "server-only";

import { db } from "@/lib/db";

export async function getProductListData(input: {
  query: string;
  requestedPage: number;
  pageSize: number;
}) {
  const where = {
    deletedAt: null,
    ...(input.query
      ? {
          OR: [
            { code: { contains: input.query } },
            { name: { contains: input.query } },
            { categoryRecord: { is: { name: { contains: input.query } } } },
            { brandRecord: { is: { name: { contains: input.query } } } },
          ],
        }
      : {}),
  };
  const totalCount = await db.product.count({ where });
  const totalPages = Math.ceil(totalCount / input.pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(input.requestedPage, totalPages);
  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * input.pageSize,
    take: input.pageSize,
    select: {
      id: true,
      code: true,
      name: true,
      price: true,
      productUnit: true,
      images: true,
      createdAt: true,
      categoryRecord: { select: { name: true } },
      brandRecord: { select: { name: true } },
    },
  });
  const stockTotals = products.length
    ? await db.productStock.groupBy({
        by: ["productId"],
        where: { productId: { in: products.map((product) => product.id) } },
        _sum: { quantity: true },
      })
    : [];
  const stockByProduct = new Map(
    stockTotals.map((stock) => [stock.productId, stock._sum.quantity?.toString() ?? "0"]),
  );

  return { totalCount, totalPages, currentPage, products, stockByProduct };
}

export async function getProductImageState(id: string) {
  return db.product.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      images: true,
      updatedAt: true,
    },
  });
}
