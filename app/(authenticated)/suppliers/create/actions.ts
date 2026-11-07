"use server";

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
    city: formData.get("city"),
    address: formData.get("address"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db.supplier.create({
    data: parsed.data,
    select: { id: true },
  });

  revalidatePath("/suppliers");
  redirect("/suppliers?created=1");
}
