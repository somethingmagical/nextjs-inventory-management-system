"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getProductAccess } from "../products/authorization";
import type { MasterDataActionState } from "../master-data/action-state";
import { getLogoEntry, getLogoFilePath, removeLogo, saveLogo } from "../master-data/logo-upload";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a brand name.").max(191, "Brand name must be 191 characters or fewer."),
});
const idSchema = z.string().trim().min(1).max(191);
const updateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Enter a brand name.").max(191, "Brand name must be 191 characters or fewer."),
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
    ? { status: "error", message: "Please sign in before managing brands." }
    : { status: "error", message: "You do not have permission to manage products." };
}

function revalidateBrandPages() {
  revalidatePath("/brands");
  revalidatePath("/products");
  revalidatePath("/products/create");
  revalidatePath("/products/[id]/edit", "page");
}

export async function createBrand(formData: FormData): Promise<MasterDataActionState> {
  const access = await getProductAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the brand name.",
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
    await db.brand.create({
      data: { name: parsed.data.name, logo: uploadedLogo?.path ?? null },
      select: { id: true },
    });
  } catch (error) {
    if (uploadedLogo) await removeLogo(uploadedLogo.filePath);
    throw error;
  }

  revalidateBrandPages();
  return { status: "success", message: "Brand created successfully." };
}

export async function updateBrand(formData: FormData): Promise<MasterDataActionState> {
  const access = await getProductAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = updateSchema.safeParse({ id: formData.get("id"), name: formData.get("name") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the brand details.",
      fieldErrors: { name: parsed.error.flatten().fieldErrors.name },
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
      const current = await transaction.brand.findFirst({
        where: { id: parsed.data.id, deletedAt: null },
        select: { id: true, name: true, logo: true },
      });
      if (!current) return null;

      const updated = await transaction.brand.updateMany({
        where: { id: current.id, deletedAt: null },
        data: {
          name: parsed.data.name,
          ...(uploadedLogo ? { logo: uploadedLogo.path } : {}),
        },
      });
      if (updated.count !== 1) return null;

      if (current.name !== parsed.data.name) {
        await transaction.product.updateMany({
          where: { brand: current.name },
          data: { brand: parsed.data.name },
        });
      }
      return { oldLogo: current.logo };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!updated) {
      if (uploadedLogo) await removeLogo(uploadedLogo.filePath);
      return { status: "error", message: "This brand no longer exists or could not be updated." };
    }
    if (uploadedLogo) {
      const oldLogoPath = getLogoFilePath(updated.oldLogo);
      if (oldLogoPath) await removeLogo(oldLogoPath);
    }
  } catch (error) {
    if (uploadedLogo) await removeLogo(uploadedLogo.filePath);
    throw error;
  }

  revalidateBrandPages();
  return { status: "success", message: "Brand updated successfully." };
}

export async function deleteBrand(formData: FormData): Promise<MasterDataActionState> {
  const access = await getProductAccess();
  if (access.status !== "allowed") return denied(access.status);

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { status: "error", message: "This brand could not be found." };

  const result = await db.$transaction(async (transaction) => {
    const brand = await transaction.brand.findFirst({
      where: { id: parsed.data.id, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!brand) return { status: "error" as const, message: "This brand no longer exists." };

    const attachedProducts = await transaction.product.count({
      where: {
        OR: [
          { brandId: brand.id },
          { brand: brand.name },
        ],
      },
    });
    if (attachedProducts > 0) {
      return { status: "error" as const, message: "This brand is used by products and cannot be deleted." };
    }

    const deleted = await transaction.brand.updateMany({
      where: { id: brand.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return deleted.count === 1
      ? { status: "success" as const }
      : { status: "error" as const, message: "This brand could not be deleted." };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.status === "error") return result;
  revalidateBrandPages();
  return { status: "success", message: "Brand deleted successfully." };
}
