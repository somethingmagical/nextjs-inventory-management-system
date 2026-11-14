import "server-only";

import { db } from "@/lib/db";

export async function getWarehouseListData(input: {
  query: string;
  requestedPage: number;
  pageSize: number;
  sortBy: "name" | "city" | "createdAt";
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
  const totalCount = await db.warehouse.count({ where });
  const totalPages = Math.ceil(totalCount / input.pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(input.requestedPage, totalPages);
  const items = await db.warehouse.findMany({
    where,
    orderBy: { [input.sortBy]: input.sortOrder },
    skip: (currentPage - 1) * input.pageSize,
    take: input.pageSize,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      city: true,
      region: true,
      country: true,
      createdAt: true,
    },
  });

  return { totalCount, totalPages, currentPage, items };
}

export async function getWarehouseEditData(id: string) {
  return db.warehouse.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      country: true,
      countryCode: true,
      city: true,
      region: true,
      suburb: true,
      zipCode: true,
      address: true,
      addressData: true,
    },
  });
}
