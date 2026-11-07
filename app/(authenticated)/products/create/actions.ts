"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getProductAccess } from "../authorization";
import { getProductImageEntries, removeProductImages, saveProductImages } from "../product-images";
import { productSchema } from "../product-schema";
import type { ProductActionState } from "./action-state";

export async function createProduct(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const access = await getProductAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a product." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage products." };
  }

  const parsed = productSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    brandId: formData.get("brandId"),
    price: formData.get("price"),
    productUnit: formData.get("productUnit"),
    stockAlert: formData.get("stockAlert"),
    orderTax: formData.get("orderTax"),
    taxType: formData.get("taxType"),
    quantityLimitation: formData.get("quantityLimitation"),
    notes: formData.get("notes"),
    warehouseId: formData.get("warehouseId"),
    supplierId: formData.get("supplierId"),
    quantity: formData.get("quantity"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const imageEntries = getProductImageEntries(formData);
  if (imageEntries.status === "invalid") {
    return {
      status: "error",
      message: "Choose up to 10 PNG, JPEG, or WebP images, each smaller than 2 MB.",
      fieldErrors: { images: ["Choose up to 10 PNG, JPEG, or WebP images, each smaller than 2 MB."] },
    };
  }

  const upload = await saveProductImages(imageEntries.files);
  if (upload.status !== "success") {
    return {
      status: "error",
      message: upload.status === "invalid"
        ? "One or more files are not valid PNG, JPEG, or WebP images."
        : "Product images could not be uploaded. Please try again.",
      fieldErrors: { images: ["Check the selected product images and try again."] },
    };
  }

  try {
    const created = await db.$transaction(async (transaction) => {
      const [category, brand, unit, warehouse, supplier] = await Promise.all([
        transaction.category.findFirst({
          where: { id: parsed.data.categoryId, deletedAt: null },
          select: { id: true, name: true },
        }),
        transaction.brand.findFirst({
          where: { id: parsed.data.brandId, deletedAt: null },
          select: { id: true, name: true },
        }),
        transaction.unit.findFirst({
          where: { name: parsed.data.productUnit, deletedAt: null },
          select: { name: true },
        }),
        transaction.warehouse.findFirst({
          where: { id: parsed.data.warehouseId, deletedAt: null },
          select: { id: true },
        }),
        transaction.supplier.findFirst({
          where: { id: parsed.data.supplierId, deletedAt: null },
          select: { id: true },
        }),
      ]);

      if (!category || !brand || !unit || !warehouse || !supplier) {
        return false;
      }

      const images = upload.images.map((image) => image.path);
      await transaction.product.create({
        data: {
          code: parsed.data.code,
          name: parsed.data.name,
          price: parsed.data.price,
          categoryId: category.id,
          brandId: brand.id,
          productUnit: unit.name,
          stockAlert: parsed.data.stockAlert,
          orderTax: parsed.data.orderTax,
          taxType: parsed.data.taxType,
          quantityLimitation: parsed.data.quantityLimitation,
          notes: parsed.data.notes,
          images: images.length ? images : Prisma.JsonNull,
          category: category.name,
          brand: brand.name,
          unit: unit.name,
          sellingPrice: parsed.data.price,
          alertQuantity: parsed.data.stockAlert ?? "0",
          image: images[0] ?? null,
          description: parsed.data.notes,
          productStocks: {
            create: {
              warehouseId: warehouse.id,
              supplierId: supplier.id,
              quantity: parsed.data.quantity,
              status: parsed.data.status,
            },
          },
        },
        select: { id: true },
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!created) {
      await removeProductImages(upload.images.map((image) => image.path));
      return {
        status: "error",
        message: "A selected product category, brand, unit, warehouse, or supplier is no longer available.",
        fieldErrors: { categoryId: ["Choose active product references and try again."] },
      };
    }
  } catch (error) {
    await removeProductImages(upload.images.map((image) => image.path));
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "A product with this code already exists, or stock already exists for the selected warehouse.",
        fieldErrors: { code: ["Use a unique product code."] },
      };
    }
    throw error;
  }

  revalidatePath("/products");
  redirect("/products?created=1");
}
