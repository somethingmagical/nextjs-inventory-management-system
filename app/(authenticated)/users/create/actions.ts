"use server";

import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canManageRoleInHierarchy } from "@/lib/authorization";
import { getUserManagementAccess } from "../authorization";
import { createUserSchema } from "../user-schema";
import { getUserImageEntry, removeUserImage, saveUserImage } from "../user-image";
import type { UserActionState } from "./action-state";

export async function createUser(
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const access = await getUserManagementAccess();
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a user." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage users." };
  }

  const parsed = createUserSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber") ?? "",
    role: formData.get("role"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const imageEntry = getUserImageEntry(formData);
  if (imageEntry.status === "invalid") {
    return { status: "error", message: "The selected image could not be read. Please choose it again." };
  }

  const [existingUser, role] = await Promise.all([
    db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } }),
    db.role.findFirst({
      where: { id: parsed.data.role, deletedAt: null },
      select: {
        id: true,
        name: true,
        permissions: { select: { permission: true } },
      },
    }),
  ]);
  if (existingUser) {
    return {
      status: "error",
      message: "That email address is already in use.",
      fieldErrors: { email: ["That email address is already in use."] },
    };
  }
  if (!role) {
    return { status: "error", message: "Select an available role.", fieldErrors: { role: ["Select an available role."] } };
  }
  if (
    !canManageRoleInHierarchy(access.user, {
      name: role.name,
      permissions: role.permissions.map(({ permission }) => permission),
    })
  ) {
    return {
      status: "error",
      message: "You cannot assign a role at or above your own level.",
      fieldErrors: { role: ["Select a role at or below your own level."] },
    };
  }

  let uploadedImage: { path: string; filePath: string } | null = null;
  if (imageEntry.file) {
    const saved = await saveUserImage(imageEntry.file);
    if (saved.status === "error") {
      return { status: "error", message: saved.message, fieldErrors: { image: [saved.message] } };
    }
    uploadedImage = { path: saved.path, filePath: saved.filePath };
  }

  const password = await hash(parsed.data.password, 12);
  try {
    await db.user.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phoneNumber: parsed.data.phoneNumber || null,
        role: role.name,
        roleId: role.id,
        password,
        image: uploadedImage?.path ?? null,
      },
      select: { id: true },
    });
  } catch (error) {
    if (uploadedImage) await removeUserImage(uploadedImage.filePath);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "That email address is already in use.",
        fieldErrors: { email: ["That email address is already in use."] },
      };
    }
    throw error;
  }

  revalidatePath("/users");
  redirect("/users?created=1");
}
