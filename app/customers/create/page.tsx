import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getCustomerAccess } from "../authorization";
import { createCustomer } from "./actions";
import CustomerForm from "./CustomerForm";

export const metadata: Metadata = {
  title: "Create Customer | Inventory",
  description: "Create an inventory customer",
};

export default function CreateCustomerPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading customer form...</p>
        </main>
      }
    >
      <AuthorizedCreateCustomer />
    </Suspense>
  );
}

async function AuthorizedCreateCustomer() {
  await connection();
  const access = await getCustomerAccess();

  if (access.status === "unauthenticated") {
    redirect("/");
  }

  if (access.status === "forbidden") {
    redirect("/customers");
  }

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Customers">
      <CustomerForm mode="create" action={createCustomer} />
    </DashboardLayout>
  );
}
