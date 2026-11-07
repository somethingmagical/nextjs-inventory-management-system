import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PurchaseReturnForm, {
  type PurchaseReturnFormInitialData,
} from "@/components/purchases/PurchaseReturnForm";
import { db } from "@/lib/db";
import { getPurchaseReturnAccess } from "../../authorization";
import { purchaseReturnIdSchema } from "../../purchase-return-create-schema";
import { getPurchaseReturnDetails } from "../../purchase-return-details";

export const metadata: Metadata = {
  title: "Edit Purchase Return",
  description: "Edit a supplier purchase return",
};

type EditPurchaseReturnPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditPurchaseReturnPage({ params }: EditPurchaseReturnPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading purchase return...</p>
        </main>
      }
    >
      <AuthorizedEditPurchaseReturnPage params={params} />
    </Suspense>
  );
}

async function AuthorizedEditPurchaseReturnPage({ params }: EditPurchaseReturnPageProps) {
  await connection();
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = purchaseReturnIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const purchaseReturn = await getPurchaseReturnDetails(parsedId.data);
  if (!purchaseReturn) notFound();

  const productIds = purchaseReturn.items.map((item) => item.product.id);
  const [warehouses, suppliers, stocks] = await Promise.all([
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
    db.productStock.findMany({
      where: {
        warehouseId: purchaseReturn.warehouseId,
        productId: { in: productIds },
      },
      select: { productId: true, quantity: true },
    }),
  ]);
  const stockByProductId = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
  const initialData: PurchaseReturnFormInitialData = {
    id: purchaseReturn.id,
    date: purchaseReturn.date.toISOString().slice(0, 10),
    warehouseId: purchaseReturn.warehouseId,
    supplierId: purchaseReturn.supplierId,
    status: purchaseReturn.status,
    orderTax: purchaseReturn.orderTax.toString(),
    discount: purchaseReturn.discount.toString(),
    shipping: purchaseReturn.shipping.toString(),
    notes: purchaseReturn.notes,
    items: purchaseReturn.items.map((item) => ({
      id: item.product.id,
      code: item.product.code,
      name: item.product.name,
      netUnitCost: item.netUnitCost.toString(),
      unit: item.unit,
      stock: stockByProductId.get(item.product.id)?.toString() ?? "0",
      quantity: item.quantity.toString(),
      discountType: item.discountType,
      discount: item.discount.toString(),
      taxType: item.taxType,
      orderTax: item.orderTax.toString(),
    })),
  };
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Purchases Returns">
      <main className="gg-content">
        <div className="page-head">
          <h1 className="gg-page-title">Edit Purchase Return</h1>
          <Link className="gg-btn gg-btn--secondary" href={`/purchases/returns/${encodeURIComponent(purchaseReturn.id)}`}>
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </div>
        <PurchaseReturnForm
          warehouses={warehouses}
          suppliers={suppliers}
          initialData={initialData}
        />
      </main>
    </DashboardLayout>
  );
}
