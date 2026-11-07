import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getPurchaseAccess } from "../authorization";
import PurchaseForm from "@/components/purchases/PurchaseForm";

export const metadata: Metadata = {
  title: "Create Purchase",
  description: "Create a supplier purchase",
};

export default function CreatePurchasePage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading purchase form...</p>
        </main>
      }
    >
      <AuthorizedCreatePurchasePage />
    </Suspense>
  );
}

async function AuthorizedCreatePurchasePage() {
  await connection();
  const access = await getPurchaseAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [warehouses, suppliers, units] = await Promise.all([
    db.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Purchases">
      <PurchaseForm warehouses={warehouses} suppliers={suppliers} units={units.map((unit) => unit.name)} />
    </DashboardLayout>
  );
}
