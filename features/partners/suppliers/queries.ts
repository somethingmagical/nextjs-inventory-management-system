import "server-only";

import { db } from "@/lib/db";

export async function getSupplierListData(input: {
  query: string;
  requestedPage: number;
  pageSize: number;
  sortBy: "name" | "phoneNumber" | "createdAt";
  sortOrder: "asc" | "desc";
}) {
  const where = {
    deletedAt: null,
    ...(input.query
      ? {
          OR: [
            { name: { contains: input.query } },
            { email: { contains: input.query } },
            { city: { contains: input.query } },
          ],
        }
      : {}),
  };
  const totalCount = await db.supplier.count({ where });
  const totalPages = Math.ceil(totalCount / input.pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(input.requestedPage, totalPages);
  const items = await db.supplier.findMany({
    where,
    orderBy: { [input.sortBy]: input.sortOrder },
    skip: (currentPage - 1) * input.pageSize,
    take: input.pageSize,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
    },
  });

  return { totalCount, totalPages, currentPage, items };
}
