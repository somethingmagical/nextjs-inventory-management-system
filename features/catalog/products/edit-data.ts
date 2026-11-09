import "server-only";

import { db } from "@/lib/db";

export async function getProductEditData(id: string) {
  const [product, categories, brands, units] = await Promise.all([
    db.product.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        categoryId: true,
        brandId: true,
        productUnit: true,
        price: true,
        stockAlert: true,
        orderTax: true,
        taxType: true,
        quantityLimitation: true,
        notes: true,
        images: true,
      },
    }),
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.brand.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { product, categories, brands, units };
}
