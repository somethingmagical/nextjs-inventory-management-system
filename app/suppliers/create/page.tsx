import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getSupplierAccess } from "../authorization";
import { createSupplier } from "./actions";
import SupplierForm from "./SupplierForm";

export const metadata: Metadata = {
  title: "Create Supplier | Inventory",
  description: "Create an inventory supplier",
};

export default function CreateSupplierPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading supplier form...</p>
        </main>
      }
    >
      <AuthorizedCreateSupplier />
    </Suspense>
  );
}

async function AuthorizedCreateSupplier() {
  await connection();
  const access = await getSupplierAccess();

  if (access.status === "unauthenticated") {
    redirect("/");
  }

  if (access.status === "forbidden") {
    redirect("/suppliers");
  }

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Suppliers">
      <SupplierForm mode="create" action={createSupplier} />
    </DashboardLayout>
  );
}
