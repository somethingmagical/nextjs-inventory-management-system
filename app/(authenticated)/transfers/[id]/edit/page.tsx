import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TransferForm, {
  type TransferFormInitialData,
  type TransferWarehouseOption,
} from "@/components/transfers/TransferForm";
import type { TransferDraftItem } from "@/components/transfers/TransferOrderItems";
import { db } from "@/lib/db";
import { getTransferAccess } from "../../authorization";
import { transferIdSchema } from "../../transfer-create-schema";
import { getTransferStockOperations } from "@/lib/transfer-stock";

export const metadata: Metadata = {
  title: "Edit Transfer",
  description: "Edit a warehouse transfer",
};

type EditTransferPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditTransferPage({ params }: EditTransferPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading transfer...</p>
        </main>
      }
    >
      <AuthorizedEditTransferPage params={params} />
    </Suspense>
  );
}

async function AuthorizedEditTransferPage({ params }: EditTransferPageProps) {
  await connection();
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = transferIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [transfer, warehouses] = await Promise.all([
    db.transfer.findFirst({
      where: { id: parsedId.data, deletedAt: null },
      select: {
        id: true,
        date: true,
        fromWarehouseId: true,
        toWarehouseId: true,
        status: true,
        orderTax: true,
        discount: true,
        shipping: true,
        notes: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            productId: true,
            netUnitCost: true,
            quantity: true,
            discountType: true,
            discount: true,
            taxType: true,
            orderTax: true,
            product: { select: { code: true, name: true, productUnit: true } },
          },
        },
      },
    }),
    db.warehouse.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!transfer) notFound();

  const productIds = transfer.items.map((item) => item.productId);
  const stocks = await db.productStock.findMany({
    where: { warehouseId: transfer.fromWarehouseId, productId: { in: productIds } },
    select: { productId: true, quantity: true },
  });
  const stockByProductId = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
  const sourceWasDebited = getTransferStockOperations(transfer.status)
    .some((operation) => operation.warehouse === "from" && operation.type === "Subtraction");
  const initialItems: TransferDraftItem[] = transfer.items.map((item) => {
    const currentStock = stockByProductId.get(item.productId);
    const availableStock = currentStock
      ? sourceWasDebited ? currentStock.plus(item.quantity) : currentStock
      : sourceWasDebited ? item.quantity : 0;
    return {
      id: item.productId,
      code: item.product.code,
      name: item.product.name,
      netUnitCost: item.netUnitCost.toString(),
      unit: item.product.productUnit,
      stock: availableStock.toString(),
      quantity: item.quantity.toString(),
      discountType: item.discountType,
      discount: item.discount.toString(),
      taxType: item.taxType,
      orderTax: item.orderTax.toString(),
    };
  });
  const initialData: TransferFormInitialData = {
    id: transfer.id,
    date: transfer.date.toISOString().slice(0, 10),
    fromWarehouseId: transfer.fromWarehouseId,
    toWarehouseId: transfer.toWarehouseId,
    orderTax: transfer.orderTax.toString(),
    discount: transfer.discount.toString(),
    shipping: transfer.shipping.toString(),
    status: transfer.status,
    notes: transfer.notes,
    items: initialItems,
  };
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const warehouseOptions: TransferWarehouseOption[] = warehouses;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Transfers">
      <TransferForm warehouses={warehouseOptions} initialData={initialData} />
    </DashboardLayout>
  );
}
