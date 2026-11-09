"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWarehouseAccess } from "../authorization";
import { warehouseSchema } from "../warehouse-schema";
import type { WarehouseActionState } from "./action-state";

export async function createWarehouse(
  _previousState: WarehouseActionState,
  formData: FormData,
): Promise<WarehouseActionState> {
  const access = await getWarehouseAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before creating a warehouse." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage warehouses." };
  }

  const parsed = warehouseSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    country: formData.get("country"),
    city: formData.get("city"),
    zipCode: formData.get("zipCode"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const warehouse = await db.warehouse.create({
    data: parsed.data,
    select: { id: true },
  });

  revalidatePath("/warehouse");
  if (formData.get("inlineCreate") === "1") {
    revalidatePath("/products/create");
    return {
      status: "success",
      message: "Warehouse created successfully.",
      createdId: warehouse.id,
      createdName: parsed.data.name,
    };
  }
  redirect("/warehouse?created=1");
}
