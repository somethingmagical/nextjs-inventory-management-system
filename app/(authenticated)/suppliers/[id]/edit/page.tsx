import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getSupplierAccess } from "../../authorization";
import { supplierIdSchema } from "../../supplier-schema";
import type { SupplierValues } from "../../supplier-schema";
import SupplierForm from "../../create/SupplierForm";
import { updateSupplier } from "./actions";

export const metadata: Metadata = {
  title: "Edit Supplier",
  description: "Update an inventory supplier",
};

type EditSupplierPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditSupplierPage({ params }: EditSupplierPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading supplier...</p>
        </main>
      }
    >
      <AuthorizedEditSupplier params={params} />
    </Suspense>
  );
}

async function AuthorizedEditSupplier({ params }: EditSupplierPageProps) {
  await connection();
  const access = await getSupplierAccess();

  if (access.status === "unauthenticated") {
    redirect("/");
  }

  if (access.status === "forbidden") {
    redirect("/suppliers");
  }

  const { id } = await params;
  const parsedId = supplierIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const supplier = await db.supplier.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      country: true,
      countryCode: true,
      region: true,
      city: true,
      suburb: true,
      zipCode: true,
      address: true,
      addressData: true,
    },
  });

  if (!supplier) {
    notFound();
  }

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const updateAction = updateSupplier.bind(null, supplier.id);
  const initialValues: SupplierValues = {
    name: supplier.name,
    email: supplier.email,
    phoneNumber: supplier.phoneNumber,
    country: supplier.country,
    countryCode: supplier.countryCode ?? "",
    region: supplier.region ?? "",
    city: supplier.city,
    suburb: supplier.suburb ?? "",
    zipCode: supplier.zipCode ?? "",
    address: supplier.address,
    addressData: supplier.addressData ? JSON.stringify(supplier.addressData) : "",
  };

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Suppliers">
      <SupplierForm mode="edit" action={updateAction} initialValues={initialValues} />
    </DashboardLayout>
  );
}
