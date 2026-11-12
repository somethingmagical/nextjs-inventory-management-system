"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSupplierAccess } from "../../authorization";
import { supplierIdSchema, supplierSchema } from "../../supplier-schema";
import type { SupplierActionState } from "../../create/action-state";

export async function updateSupplier(
  supplierId: string,
  _previousState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  const access = await getSupplierAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before updating a supplier." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage suppliers." };
  }

  const parsedId = supplierIdSchema.safeParse(supplierId);
  if (!parsedId.success) {
    return { status: "error", message: "This supplier could not be found." };
  }

  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    country: formData.get("country"),
    region: formData.get("region"),
    city: formData.get("city"),
    zipCode: formData.get("zipCode"),
    address: formData.get("address"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supplier = await db.supplier.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      country: true,
      region: true,
      city: true,
      zipCode: true,
      address: true,
    },
  });

  if (!supplier) {
    return { status: "error", message: "This supplier no longer exists or has been deleted." };
  }

  const hasChanges =
    supplier.name !== parsed.data.name ||
    supplier.email !== parsed.data.email ||
    supplier.phoneNumber !== parsed.data.phoneNumber ||
    supplier.country !== parsed.data.country ||
    supplier.region !== parsed.data.region ||
    supplier.city !== parsed.data.city ||
    supplier.zipCode !== parsed.data.zipCode ||
    supplier.address !== parsed.data.address;

  if (!hasChanges) {
    redirect("/suppliers");
  }

  const updated = await db.supplier.updateMany({
    where: { id: supplier.id, deletedAt: null },
    data: parsed.data,
  });

  if (updated.count !== 1) {
    return { status: "error", message: "This supplier could not be updated. Refresh and try again." };
  }

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${encodeURIComponent(supplier.id)}/edit`);
  return { status: "success", message: "Supplier updated successfully." };
}
