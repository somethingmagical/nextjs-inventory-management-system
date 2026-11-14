"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSupplierAccess } from "../authorization";
import { supplierSchema } from "../supplier-schema";
import type { SupplierActionState } from "./action-state";

export async function createSupplier(
  _previousState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  const access = await getSupplierAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a supplier." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage suppliers." };
  }

  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
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

  const supplier = await db.supplier.create({
    data: { ...parsed.data, addressData: parsed.data.addressData ?? Prisma.DbNull },
    select: { id: true },
  });

  revalidatePath("/suppliers");
  if (formData.get("inlineCreate") === "1") {
    revalidatePath("/products/create");
    revalidatePath("/products/[id]/edit", "page");
    return {
      status: "success",
      message: "Supplier created successfully.",
      createdId: supplier.id,
      createdName: parsed.data.name,
    };
  }
  redirect("/suppliers?created=1");
}
