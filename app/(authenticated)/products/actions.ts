"use server";

import { revalidatePath } from "next/cache";
import { softDeleteProduct } from "@/features/catalog/products/delete";
import { getProductAccess } from "./authorization";
import { productIdSchema } from "./product-schema";
import type { ProductActionState } from "./create/action-state";

export async function deleteProduct(productId: string): Promise<ProductActionState> {
  const access = await getProductAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before deleting a product." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage products." };
  }

  const parsedId = productIdSchema.safeParse(productId);
  if (!parsedId.success) {
    return { status: "error", message: "This product could not be found." };
  }

  const result = await softDeleteProduct(parsedId.data);

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${encodeURIComponent(parsedId.data)}`);
  revalidatePath(`/products/${encodeURIComponent(parsedId.data)}/edit`);
  return { status: "success", message: "Product deleted successfully." };
}
