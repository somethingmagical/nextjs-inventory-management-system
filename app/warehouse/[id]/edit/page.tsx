import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getWarehouseAccess } from "../../authorization";
import { warehouseIdSchema } from "../../warehouse-schema";
import WarehouseForm from "../../create/WarehouseForm";
import { updateWarehouse } from "./actions";

export const metadata: Metadata = {
  title: "Edit Warehouse | Inventory",
  description: "Update an inventory warehouse",
};

type EditWarehousePageProps = {
  params: Promise<{ id: string }>;
};

export default function EditWarehousePage({ params }: EditWarehousePageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading warehouse...</p>
        </main>
      }
    >
      <AuthorizedEditWarehouse params={params} />
    </Suspense>
  );
}

async function AuthorizedEditWarehouse({ params }: EditWarehousePageProps) {
  await connection();
  const access = await getWarehouseAccess();

  if (access.status === "unauthenticated") {
    redirect("/");
  }

  if (access.status === "forbidden") {
    redirect("/warehouse");
  }

  const { id } = await params;
  const parsedId = warehouseIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
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
      zipCode: true,
    },
  });

  if (!warehouse) {
    notFound();
  }

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const updateAction = updateWarehouse.bind(null, warehouse.id);

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Warehouse">
      <WarehouseForm
        mode="edit"
        action={updateAction}
        initialValues={{
          name: warehouse.name,
          email: warehouse.email,
          phoneNumber: warehouse.phoneNumber,
          country: warehouse.country,
          city: warehouse.city,
          zipCode: warehouse.zipCode,
        }}
      />
    </DashboardLayout>
  );
}
