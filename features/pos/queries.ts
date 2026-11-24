import "server-only";

import { db } from "@/lib/db";
import { resolveProductDiscount } from "@/lib/product-discount";
import type { PosProduct } from "./types";

export async function getPosPageData() {
  const [warehouses, customers, categories, brands] = await Promise.all([
    db.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
  ]);

  return {
    warehouses,
    customers,
    categories,
    brands,
  };
}

export async function getPosProducts(warehouseId: string): Promise<PosProduct[]> {
  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      categoryRecord: { is: { deletedAt: null } },
      brandRecord: { is: { deletedAt: null } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      image: true,
      images: true,
      price: true,
      productUnit: true,
      stockAlert: true,
      orderTax: true,
      taxType: true,
      defaultDiscountType: true,
      defaultDiscount: true,
      categoryId: true,
      categoryRecord: { select: { name: true } },
      brandId: true,
      brandRecord: { select: { name: true } },
      productStocks: {
        where: { warehouseId },
        select: { quantity: true },
      },
      warehouseDiscounts: {
        where: { warehouseId },
        select: { discountType: true, discount: true },
      },
    },
  });

  return products.map((product) => {
    const warehouseOverride = product.warehouseDiscounts[0];
    const discount = resolveProductDiscount(
      {
        discountType: product.defaultDiscountType,
        discount: product.defaultDiscount.toString(),
      },
      warehouseOverride
        ? {
          discountType: warehouseOverride.discountType,
          discount: warehouseOverride.discount.toString(),
        }
        : null,
    );
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      image: getPrimaryImage(product.images, product.image),
      price: product.price.toString(),
      stock: product.productStocks[0]?.quantity.toString() ?? "0",
      stockAlert: product.stockAlert?.toString() ?? null,
      unit: product.productUnit,
      taxRate: product.orderTax?.toString() ?? "0",
      taxType: product.taxType,
      categoryId: product.categoryId,
      categoryName: product.categoryRecord.name,
      brandId: product.brandId,
      brandName: product.brandRecord.name,
      discountType: discount.discountType,
      discount: discount.discount,
    };
  });
}

function getPrimaryImage(images: unknown, legacyImage: string | null): string | null {
  if (Array.isArray(images)) {
    const firstImage = images.find(
      (image): image is string => typeof image === "string" && image.trim().length > 0,
    );
    if (firstImage) return firstImage;
  }
  return legacyImage;
}
