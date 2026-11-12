import "server-only";

import { db } from "@/lib/db";

export async function getExpenseCategoryListData(input: {
  query: string;
  requestedPage: number;
  pageSize: number;
  sortOrder: "asc" | "desc";
}) {
  const where = {
    deletedAt: null,
    ...(input.query ? { name: { contains: input.query } } : {}),
  };
  const totalCount = await db.expenseCategory.count({ where });
  const totalPages = Math.ceil(totalCount / input.pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(input.requestedPage, totalPages);
  const items = await db.expenseCategory.findMany({
    where,
    orderBy: [{ name: input.sortOrder }, { createdAt: input.sortOrder }],
    skip: (currentPage - 1) * input.pageSize,
    take: input.pageSize,
    select: { id: true, name: true },
  });

  return { totalCount, totalPages, currentPage, items };
}
