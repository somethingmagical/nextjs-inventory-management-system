"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProductImageState } from "@/features/catalog/products/queries";
import { updateProductDetails } from "@/features/catalog/products/update";
import { resolveProductImageOrder } from "@/lib/product-image-order";
import { getProductAccess } from "../../authorization";
import {
  getProductImageEntries,
  getProductImagePaths,
  removeProductImages,
  saveProductImages,
} from "../../product-images";
import {
  productDetailsSchema,
  productIdSchema,
  productImageRemovalsSchema,
} from "../../product-schema";
import type { ProductActionState } from "../../create/action-state";

export async function updateProduct(
  productId: string,
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const access = await getProductAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before updating a product." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage products." };
  }

  const parsedId = productIdSchema.safeParse(productId);
  if (!parsedId.success) {
    return { status: "error", message: "This product could not be found." };
  }
  const parsed = productDetailsSchema.safeParse({
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
  const parsedRemovals = productImageRemovalsSchema.safeParse(formData.getAll("removeImage"));
  if (!parsedRemovals.success) {
    return { status: "error", message: "The image selection is invalid. Refresh and try again." };
  }
  const parsedImageOrder = z.array(z.string().max(600)).max(10).safeParse(formData.getAll("imageOrder"));
  const parsedNewImageIds = z.array(
    z.string().regex(/^new:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i),
  ).max(10).safeParse(formData.getAll("newImageId"));
  if (!parsedImageOrder.success || !parsedNewImageIds.success) {
    return {
      status: "error",
      message: "The product image order is invalid. Review the selected images and try again.",
      fieldErrors: { images: ["The product image order is invalid."] },
    };
  }

  const product = await getProductImageState(parsedId.data);
  if (!product) {
    return { status: "error", message: "This product no longer exists or has been deleted." };
  }

  const existingImages = getProductImagePaths(product.images);
  const removedImages = existingImages.filter((image) => parsedRemovals.data.includes(image));
  const retainedImages = existingImages.filter((image) => !removedImages.includes(image));
  if (retainedImages.length + imageEntries.files.length > 10) {
    return {
      status: "error",
      message: "A product can have up to 10 images. Remove an image before adding more.",
      fieldErrors: { images: ["A product can have up to 10 images."] },
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

  const images = resolveProductImageOrder({
    order: parsedImageOrder.data,
    existingImages,
    removedImages,
    newImageIds: parsedNewImageIds.data,
    uploadedImagePaths: upload.images.map((image) => image.path),
  });
  if (!images) {
    await removeProductImages(upload.images.map((image) => image.path));
    return {
      status: "error",
      message: "The product image order is invalid. Review the selected images and try again.",
      fieldErrors: { images: ["The product image order is invalid."] },
    };
  }
  try {
    const updated = await updateProductDetails({
      id: parsedId.data,
      expectedUpdatedAt: product.updatedAt,
      details: parsed.data,
      images,
    });

    if (!updated) {
      await removeProductImages(upload.images.map((image) => image.path));
      return {
        status: "error",
        message: "The product or one of its selected references is no longer available.",
      };
    }
  } catch (error) {
    await removeProductImages(upload.images.map((image) => image.path));
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "A product with this code already exists.",
        fieldErrors: { code: ["Use a unique product code."] },
      };
    }
    throw error;
  }

  await removeProductImages(removedImages);
  revalidatePath("/products");
  revalidatePath(`/products/${encodeURIComponent(product.id)}`);
  revalidatePath(`/products/${encodeURIComponent(product.id)}/edit`);
  return { status: "success", message: "Product updated successfully." };
}
