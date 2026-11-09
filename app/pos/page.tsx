import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import { getPosPageData, getPosProducts } from "@/features/pos/queries";
import PosScreen from "./PosScreen";

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

  const { warehouses, customers, categories, brands, defaultCustomerId } = await getPosPageData();
  const selectedWarehouseId = warehouses[0]?.id ?? "";
  const products = selectedWarehouseId ? await getPosProducts(selectedWarehouseId) : [];

  return (
    <PosScreen
      warehouses={warehouses}
      customers={customers}
      categories={categories}
      brands={brands}
      initialProducts={products}
      defaultCustomerId={defaultCustomerId}
      initialWarehouseId={selectedWarehouseId}
    />
  );
}
