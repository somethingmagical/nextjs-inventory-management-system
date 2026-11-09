import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getProductEditData } from "@/features/catalog/products/edit-data";
import { getProductAccess } from "../../authorization";
import { getProductImagePaths } from "../../product-images";
import { productIdSchema } from "../../product-schema";
import { PERMISSION } from "@/lib/permissions";
import ProductForm from "../../create/ProductForm";
import { updateProduct } from "./actions";

export const metadata: Metadata = {
  title: "Edit Product",
  description: "Update an inventory product",
};

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditProductPage({ params }: EditProductPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading product...</p>
        </main>
      }
    >
      <AuthorizedEditProduct params={params} />
    </Suspense>
  );
}

async function AuthorizedEditProduct({ params }: EditProductPageProps) {
  await connection();
  const access = await getProductAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = productIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const { product, categories, brands, units } = await getProductEditData(parsedId.data);
  if (!product) notFound();
  const unitOptions = units.map((unit) => ({ ...unit, value: unit.name }));

  const name = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const initialValues = {
    code: product.code,
    name: product.name,
    categoryId: product.categoryId,
    brandId: product.brandId,
    productUnit: product.productUnit,
    price: product.price.toFixed(2),
    stockAlert: product.stockAlert?.toString() ?? "",
    orderTax: product.orderTax?.toString() ?? "",
    taxType: product.taxType,
    quantityLimitation: product.quantityLimitation?.toString() ?? "",
    notes: product.notes ?? "",
  };
  const updateAction = updateProduct.bind(null, product.id);

  return (
    <DashboardLayout user={{ name, image: access.user.image }} pageTitle="Products">
      <ProductForm
        mode="edit"
        action={updateAction}
        initialValues={initialValues}
        categories={categories}
        canCreateCategory={access.user.permissions.includes(PERMISSION.manageProductCategories)}
        canCreateBrand={access.user.permissions.includes(PERMISSION.manageBrands)}
        canCreateSupplier={false}
        canCreateWarehouse={false}
        brands={brands}
        units={unitOptions}
        images={getProductImagePaths(product.images)}
      />
    </DashboardLayout>
  );
}
