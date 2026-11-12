"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWarehouseAccess } from "../../authorization";
import { warehouseIdSchema, warehouseSchema } from "../../warehouse-schema";
import type { WarehouseActionState } from "../../create/action-state";

export async function updateWarehouse(
  warehouseId: string,
  _previousState: WarehouseActionState,
  formData: FormData,
): Promise<WarehouseActionState> {
  const access = await getWarehouseAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before updating a warehouse." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage warehouses." };
  }

  const parsedId = warehouseIdSchema.safeParse(warehouseId);
  if (!parsedId.success) {
    return { status: "error", message: "This warehouse could not be found." };
  }

  const parsed = warehouseSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    country: formData.get("country"),
    city: formData.get("city"),
    region: formData.get("region") ?? "",
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

  const warehouse = await db.warehouse.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      country: true,
      city: true,
      region: true,
      zipCode: true,
      address: true,
    },
  });

  if (!warehouse) {
    return { status: "error", message: "This warehouse no longer exists or has been deleted." };
  }

  const hasChanges =
    warehouse.name !== parsed.data.name ||
    warehouse.email !== parsed.data.email ||
    warehouse.phoneNumber !== parsed.data.phoneNumber ||
    warehouse.country !== parsed.data.country ||
    warehouse.city !== parsed.data.city ||
    warehouse.region !== parsed.data.region ||
    warehouse.zipCode !== parsed.data.zipCode ||
    warehouse.address !== parsed.data.address;

  if (!hasChanges) {
    redirect("/warehouse");
  }

  const updated = await db.warehouse.updateMany({
    where: { id: warehouse.id, deletedAt: null },
    data: parsed.data,
  });

  if (updated.count !== 1) {
    return { status: "error", message: "This warehouse could not be updated. Refresh and try again." };
  }

  revalidatePath("/warehouse");
  revalidatePath(`/warehouse/${encodeURIComponent(warehouse.id)}/edit`);
  redirect("/warehouse?updated=1");
}
