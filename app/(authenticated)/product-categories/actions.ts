"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getProductCategoryAccess } from "../products/authorization";
import type { MasterDataActionState } from "../../master-data/action-state";
import { getLogoEntry, getLogoFilePath, removeLogo, saveLogo } from "../../master-data/logo-upload";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(191, "Category name must be 191 characters or fewer."),
});
const idSchema = z.string().trim().min(1).max(191);
const updateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Enter a category name.").max(191, "Category name must be 191 characters or fewer."),
});
const deleteSchema = z.object({ id: idSchema });

function invalidLogo(): MasterDataActionState {
  return {
    status: "error",
    message: "Choose a PNG, JPEG, or WebP logo smaller than 2 MB.",
    fieldErrors: { logo: ["Choose a PNG, JPEG, or WebP logo smaller than 2 MB."] },
  };
}

function logoUploadFailed(): MasterDataActionState {
  const message = "The logo could not be uploaded. Please try again.";
  return { status: "error", message, fieldErrors: { logo: [message] } };
}

function denied(status: "unauthenticated" | "forbidden"): MasterDataActionState {
  return status === "unauthenticated"
    ? { status: "error", message: "Please sign in before managing product categories." }
    : { status: "error", message: "You do not have permission to manage product categories." };
}

function revalidateCategoryPages() {
  revalidatePath("/product-categories");
  revalidatePath("/products");
  revalidatePath("/products/create");
  revalidatePath("/products/[id]/edit", "page");
}

export async function createCategory(formData: FormData): Promise<MasterDataActionState> {
  const access = await getProductCategoryAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the category name.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const logoEntry = getLogoEntry(formData);
  if (logoEntry.status === "invalid") return invalidLogo();

  let uploadedLogo: { path: string; filePath: string } | null = null;
  if (logoEntry.file) {
    const saved = await saveLogo(logoEntry.file);
    if (saved.status === "invalid") return invalidLogo();
    if (saved.status === "error") return logoUploadFailed();
    uploadedLogo = { path: saved.path, filePath: saved.filePath };
  }

  try {
    await db.category.create({
      data: { name: parsed.data.name, logo: uploadedLogo?.path ?? null },
      select: { id: true },
    });
  } catch (error) {
    if (uploadedLogo) await removeLogo(uploadedLogo.filePath);
    throw error;
  }

  revalidateCategoryPages();
  return { status: "success", message: "Product category created successfully." };
}

export async function updateCategory(formData: FormData): Promise<MasterDataActionState> {
  const access = await getProductCategoryAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = updateSchema.safeParse({ id: formData.get("id"), name: formData.get("name") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the category details.",
      fieldErrors: {
        name: parsed.error.flatten().fieldErrors.name,
      },
    };
  }
  const logoEntry = getLogoEntry(formData);
  if (logoEntry.status === "invalid") return invalidLogo();

  let uploadedLogo: { path: string; filePath: string } | null = null;
  if (logoEntry.file) {
    const saved = await saveLogo(logoEntry.file);
    if (saved.status === "invalid") return invalidLogo();
    if (saved.status === "error") return logoUploadFailed();
    uploadedLogo = { path: saved.path, filePath: saved.filePath };
  }

  try {
    const updated = await db.$transaction(async (transaction) => {
      const current = await transaction.category.findFirst({
        where: { id: parsed.data.id, deletedAt: null },
        select: { id: true, name: true, logo: true },
      });
      if (!current) return null;

      const updated = await transaction.category.updateMany({
        where: { id: current.id, deletedAt: null },
        data: {
          name: parsed.data.name,
          ...(uploadedLogo ? { logo: uploadedLogo.path } : {}),
        },
      });
      if (updated.count !== 1) return null;

      if (current.name !== parsed.data.name) {
        await transaction.product.updateMany({
          where: { category: current.name },
          data: { category: parsed.data.name },
        });
      }
      return { oldLogo: current.logo };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!updated) {
      if (uploadedLogo) await removeLogo(uploadedLogo.filePath);
      return { status: "error", message: "This product category no longer exists or could not be updated." };
    }
    if (uploadedLogo) {
      const oldLogoPath = getLogoFilePath(updated.oldLogo);
      if (oldLogoPath) await removeLogo(oldLogoPath);
    }
  } catch (error) {
    if (uploadedLogo) await removeLogo(uploadedLogo.filePath);
    throw error;
  }

  revalidateCategoryPages();
  return { status: "success", message: "Product category updated successfully." };
}

export async function deleteCategory(formData: FormData): Promise<MasterDataActionState> {
  const access = await getProductCategoryAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { status: "error", message: "This product category could not be found." };

  const result = await db.$transaction(async (transaction) => {
    const category = await transaction.category.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!category) return { status: "error" as const, message: "This product category no longer exists." };

    const attachedProducts = await transaction.product.count({
      where: {
        deletedAt: null,
        OR: [
          { categoryId: category.id },
          { category: category.name },
        ],
      },
    });
    if (attachedProducts > 0) {
      return {
        status: "error" as const,
        message: "This category is used by products and cannot be deleted.",
      };
    }

    const deleted = await transaction.category.updateMany({
      where: { id: category.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return deleted.count === 1
      ? { status: "success" as const }
      : { status: "error" as const, message: "This product category could not be deleted." };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.status === "error") return result;
  revalidateCategoryPages();
  return { status: "success", message: "Product category deleted successfully." };
}
