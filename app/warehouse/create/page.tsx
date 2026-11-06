import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getWarehouseAccess } from "../authorization";
import { createWarehouse } from "./actions";
import WarehouseForm from "./WarehouseForm";

export const metadata: Metadata = {
  title: "Create Warehouse | Inventory",
  description: "Create an inventory warehouse",
};

export default function CreateWarehousePage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading warehouse form...</p>
        </main>
      }
    >
      <AuthorizedCreateWarehouse />
    </Suspense>
  );
}

async function AuthorizedCreateWarehouse() {
  await connection();
  const access = await getWarehouseAccess();

  if (access.status === "unauthenticated") {
    redirect("/");
  }

  if (access.status === "forbidden") {
    redirect("/warehouse");
  }

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Warehouse">
      <WarehouseForm mode="create" action={createWarehouse} />
    </DashboardLayout>
  );
}
