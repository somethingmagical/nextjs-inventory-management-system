"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/authorization";
import { db } from "@/lib/db";
import { PERMISSION } from "@/lib/permissions";
import { getPosProducts } from "@/features/pos/queries";
import { customerSchema } from "@/app/(authenticated)/customers/customer-schema";
import type { CustomerField } from "@/app/(authenticated)/customers/create/action-state";
import type { PosOption } from "./types";

const warehouseIdSchema = z.string().trim().min(1).max(191);

export type PosCustomerActionState =
  | { status: "idle"; message: "" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<CustomerField, string[]>> }
  | { status: "success"; message: string; customer: PosOption };

export const initialPosCustomerActionState: PosCustomerActionState = {
  status: "idle",
  message: "",
};

export async function createPosCustomer(
  _previousState: PosCustomerActionState,
  formData: FormData,
): Promise<PosCustomerActionState> {
  const access = await requirePermission(PERMISSION.manageCustomers);
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a customer." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage customers." };
  }

  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    country: formData.get("country"),
    countryCode: formData.get("countryCode") ?? "",
    region: formData.get("region"),
    city: formData.get("city"),
    suburb: formData.get("suburb") ?? "",
    zipCode: formData.get("zipCode"),
    address: formData.get("address"),
    addressData: formData.get("addressData"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const customer = await db.customer.create({
      data: { ...parsed.data, addressData: parsed.data.addressData ?? Prisma.DbNull },
      select: { id: true, name: true },
    });
    revalidatePath("/customers");
    revalidatePath("/pos");
    return { status: "success", message: "Customer created.", customer };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: "error",
        message: "A customer with this email already exists.",
        fieldErrors: { email: ["Use a unique email address."] },
      };
    }
    throw error;
  }
}

export type PosProductsResult =
  | { status: "success"; products: Awaited<ReturnType<typeof getPosProducts>> }
  | { status: "error"; message: string };

export async function loadPosProducts(warehouseId: string): Promise<PosProductsResult> {
  const access = await requirePermission(PERMISSION.managePosScreen);
  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in to use the POS screen." };
  }
  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to use the POS screen." };
  }

  const parsedWarehouseId = warehouseIdSchema.safeParse(warehouseId);
  if (!parsedWarehouseId.success) {
    return { status: "error", message: "Select a valid warehouse to load products." };
  }

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsedWarehouseId.data, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) {
    return { status: "error", message: "The selected warehouse is no longer available." };
  }

  return {
    status: "success",
    products: await getPosProducts(warehouse.id),
  };
}
