import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getCustomerAccess } from "../../authorization";
import { customerIdSchema } from "../../customer-schema";
import type { CustomerValues } from "../../customer-schema";
import CustomerForm from "../../create/CustomerForm";
import { updateCustomer } from "./actions";

export const metadata: Metadata = {
  title: "Edit Customer",
  description: "Update an inventory customer",
};

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditCustomerPage({ params }: EditCustomerPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading customer...</p>
        </main>
      }
    >
      <AuthorizedEditCustomer params={params} />
    </Suspense>
  );
}

async function AuthorizedEditCustomer({ params }: EditCustomerPageProps) {
  await connection();
  const access = await getCustomerAccess();

  if (access.status === "unauthenticated") {
    redirect("/");
  }

  if (access.status === "forbidden") {
    redirect("/customers");
  }

  const { id } = await params;
  const parsedId = customerIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
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
    notFound();
  }

  if (customer.id === "direct-customer") {
    redirect("/customers");
  }

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const updateAction = updateCustomer.bind(null, customer.id);
  const initialValues: CustomerValues = {
    name: customer.name,
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    dateOfBirth: customer.dateOfBirth?.toISOString().slice(0, 10) ?? "",
    country: customer.country,
    city: customer.city,
    address: customer.address,
  };

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Customers">
      <CustomerForm mode="edit" action={updateAction} initialValues={initialValues} />
    </DashboardLayout>
  );
}
