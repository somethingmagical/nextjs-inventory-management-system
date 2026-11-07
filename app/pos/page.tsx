import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import PosScreen from "./PosScreen";
import { getPosProducts } from "./data";

export const metadata: Metadata = {
  title: "POS",
  description: "Point of sale",
};

export default function PosPage() {
  return (
    <Suspense
      fallback={
        <main className="pos-loading" aria-busy="true">
          Loading POS...
        </main>
      }
    >
      <AuthorizedPosPage />
    </Suspense>
  );
}

async function AuthorizedPosPage() {
  await connection();
  const access = await requirePermission(PERMISSION.managePosScreen);
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [warehouses, customers, categories, brands, directCustomer] = await Promise.all([
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
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.brand.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.customer.findFirst({
      where: { id: "direct-customer", deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!directCustomer) {
    throw new Error("The protected direct-customer record is missing. Run the application seed before using POS.");
  }

  const selectedWarehouseId = warehouses[0]?.id ?? "";
  const products = selectedWarehouseId ? await getPosProducts(selectedWarehouseId) : [];

  return (
    <PosScreen
      warehouses={warehouses}
      customers={customers}
      categories={categories}
      brands={brands}
      initialProducts={products}
      defaultCustomerId={directCustomer.id}
      initialWarehouseId={selectedWarehouseId}
    />
  );
}
