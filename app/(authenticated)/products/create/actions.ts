"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProductWithInitialStock } from "@/features/catalog/products/create";
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
    const created = await createProductWithInitialStock({
      ...parsed.data,
      images: upload.images.map((image) => image.path),
      actorId: access.userId,
    });
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
