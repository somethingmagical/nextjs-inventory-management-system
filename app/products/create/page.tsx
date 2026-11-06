import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getProductAccess } from "../authorization";
import { createProduct } from "./actions";
import ProductForm from "./ProductForm";

export const metadata: Metadata = {
  title: "Create Product | Inventory",
  description: "Create an inventory product",
};

export default function CreateProductPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading product form...</p>
        </main>
      }
    >
      <AuthorizedCreateProduct />
    </Suspense>
  );
}

async function AuthorizedCreateProduct() {
  await connection();
  const access = await getProductAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [categories, brands, units, warehouses, suppliers] = await Promise.all([
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
    db.unit.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
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
  ]);
  const unitOptions = units.map((unit) => ({ ...unit, value: unit.name }));
  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Products">
      {(!categories.length || !brands.length || !units.length || !warehouses.length || !suppliers.length) && (
        <aside className="product-prerequisite-notice" role="note">
          <strong>Complete the available setup first:</strong>
          <span>
            {!categories.length && <> Add a <Link href="/product-categories">product category</Link>.</>}
            {!brands.length && <> Add a <Link href="/brands">brand</Link>.</>}
            {!warehouses.length && <> Add a <Link href="/warehouse">warehouse</Link>.</>}
            {!suppliers.length && <> Add a <Link href="/suppliers">supplier</Link>.</>}
            {!units.length && <> Ask an administrator to add an available product unit.</>}
          </span>
        </aside>
      )}
      <ProductForm
        mode="create"
        action={createProduct}
        categories={categories}
        brands={brands}
        units={unitOptions}
        warehouses={warehouses}
        suppliers={suppliers}
      />
    </DashboardLayout>
  );
}
