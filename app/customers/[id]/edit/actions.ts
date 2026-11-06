"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCustomerAccess } from "../../authorization";
import { customerIdSchema, customerSchema } from "../../customer-schema";
import type { CustomerActionState } from "../../create/action-state";

export async function updateCustomer(
  customerId: string,
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const access = await getCustomerAccess();

  if (access.status === "unauthenticated") {
    return { status: "error", message: "Please sign in before updating a customer." };
  }

  if (access.status === "forbidden") {
    return { status: "error", message: "You do not have permission to manage customers." };
  }

  const parsedId = customerIdSchema.safeParse(customerId);
  if (!parsedId.success) {
    return { status: "error", message: "This customer could not be found." };
  }

  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    dateOfBirth: formData.get("dateOfBirth") ?? "",
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

  const customer = await db.customer.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      dateOfBirth: true,
      country: true,
      city: true,
      address: true,
    },
  });

  if (!customer) {
    return { status: "error", message: "This customer no longer exists or has been deleted." };
  }

  // POS uses this walk-in record as the fallback customer, so its identity must remain fixed.
  if (customer.id === "direct-customer") {
    return { status: "error", message: "The default POS customer cannot be edited." };
  }

  const hasChanges =
    customer.name !== parsed.data.name ||
    customer.email !== parsed.data.email ||
    customer.phoneNumber !== parsed.data.phoneNumber ||
    customer.dateOfBirth?.getTime() !== parsed.data.dateOfBirth?.getTime() ||
    customer.country !== parsed.data.country ||
    customer.city !== parsed.data.city ||
    customer.address !== parsed.data.address;

  if (!hasChanges) {
    redirect("/customers");
  }

  const updated = await db.customer.updateMany({
    where: { id: customer.id, deletedAt: null },
    data: parsed.data,
  });

  if (updated.count !== 1) {
    return { status: "error", message: "This customer could not be updated. Refresh and try again." };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${encodeURIComponent(customer.id)}/edit`);
  redirect("/customers?updated=1");
}
