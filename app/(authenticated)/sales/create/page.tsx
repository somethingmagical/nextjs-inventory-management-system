import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SaleForm from "@/components/sales/SaleForm";
import { db } from "@/lib/db";
import { getSaleAccess } from "../authorization";

export const metadata: Metadata = {
  title: "Create Sale",
  description: "Create a customer sale",
};

export default function CreateSalePage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale form...</p>
        </main>
      }
    >
      <AuthorizedCreateSalePage />
    </Suspense>
  );
}

async function AuthorizedCreateSalePage() {
  await connection();
  const access = await getSaleAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [warehouses, customers, units, directCustomer] = await Promise.all([
    db.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    db.customer.findFirst({
      where: { id: "direct-customer", deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!directCustomer) {
    throw new Error("The protected direct-customer record is missing. Run the application seed before creating sales.");
  }

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales">
      <SaleForm
        warehouses={warehouses}
        customers={customers}
        units={units.map((unit) => unit.name)}
        defaultCustomerId={directCustomer.id}
      />
    </DashboardLayout>
  );
}
