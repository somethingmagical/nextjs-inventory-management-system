"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCustomerAccess } from "../authorization";
import { customerSchema } from "../customer-schema";
import type { CustomerActionState } from "./action-state";

export async function createCustomer(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const access = await getCustomerAccess();

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

  await db.customer.create({
    data: parsed.data,
    select: { id: true },
  });

  revalidatePath("/customers");
  redirect("/customers?created=1");
}
