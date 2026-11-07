"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { ProfileActionState } from "./profile-state";
import { z } from "zod";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Enter your last name.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phoneNumber: z.string().trim().max(40, "Phone number must be 40 characters or fewer."),
});

const maxImageSize = 1024 * 1024;
const uploadDirectory = path.join(process.cwd(), "public", "uploads", "profiles");

function isSupportedImage(bytes: Uint8Array) {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  if (isPng) return { extension: "png", mimeType: "image/png" };
  if (isJpeg) return { extension: "jpg", mimeType: "image/jpeg" };
  if (isWebp) return { extension: "webp", mimeType: "image/webp" };
  return null;
}

async function removeUploadedFile(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    console.error("Failed to remove an unused profile image.", error);
  }
}

export async function updateProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { status: "error", message: "Please sign in again to update your profile." };
  }

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const imageEntry = formData.get("image");
  if (imageEntry !== null && !(imageEntry instanceof File)) {
    return {
      status: "error",
      message: "The selected image could not be read. Please choose it again.",
      fieldErrors: { image: ["The selected image could not be read. Please choose it again."] },
    };
  }

  const hasNewImage = imageEntry instanceof File && imageEntry.size > 0;
  const currentUser = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true, phoneNumber: true },
  });

  if (!currentUser) {
    return { status: "error", message: "Your account could not be found. Please sign in again." };
  }

  const hasProfileChanges =
    parsed.data.firstName !== currentUser.firstName ||
    parsed.data.lastName !== currentUser.lastName ||
    parsed.data.email !== currentUser.email ||
    (parsed.data.phoneNumber || null) !== currentUser.phoneNumber ||
    hasNewImage;

  if (!hasProfileChanges) {
    return { status: "unchanged", message: "No changes to save." };
  }

  const existingEmail = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (existingEmail && existingEmail.id !== userId) {
    return {
      status: "error",
      message: "That email address is already in use.",
      fieldErrors: { email: ["That email address is already in use."] },
    };
  }

  let uploadedImage: { path: string; filePath: string } | null = null;

  if (imageEntry instanceof File && imageEntry.size > 0) {
    if (imageEntry.size > maxImageSize) {
      return {
        status: "error",
        message: "Choose an image smaller than 1 MB.",
        fieldErrors: { image: ["Choose an image smaller than 1 MB."] },
      };
    }

    const bytes = new Uint8Array(await imageEntry.arrayBuffer());
    const imageFormat = isSupportedImage(bytes);

    if (!imageFormat || (imageEntry.type && imageEntry.type !== imageFormat.mimeType)) {
      return {
        status: "error",
        message: "Choose a PNG, JPEG, or WebP image.",
        fieldErrors: { image: ["Choose a PNG, JPEG, or WebP image."] },
      };
    }

    const fileName = `${randomUUID()}.${imageFormat.extension}`;
    const filePath = path.join(uploadDirectory, fileName);

    try {
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(filePath, bytes, { flag: "wx" });
      uploadedImage = { path: `/uploads/profiles/${fileName}`, filePath };
    } catch (error) {
      console.error("Failed to save the uploaded profile image.", error);
      return { status: "error", message: "The image could not be uploaded. Please try again." };
    }
  }

  try {
    // Role is intentionally excluded from self-service updates; role changes belong to admin user management.
    await db.user.update({
      where: { id: userId },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phoneNumber: parsed.data.phoneNumber || null,
        ...(uploadedImage ? { image: uploadedImage.path } : {}),
      },
    });
  } catch (error) {
    if (uploadedImage) {
      await removeUploadedFile(uploadedImage.filePath);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "That email address is already in use.",
        fieldErrors: { email: ["That email address is already in use."] },
      };
    }

    throw error;
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");

  return { status: "success", message: "Your profile has been updated." };
}
