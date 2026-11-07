import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import TransferForm, { type TransferWarehouseOption } from "@/components/transfers/TransferForm";
import { db } from "@/lib/db";
import { getTransferAccess } from "../authorization";

export const metadata: Metadata = {
  title: "Create Transfer",
  description: "Move products between warehouses",
};

export default function CreateTransferPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading transfer form...</p>
        </main>
      }
    >
      <AuthorizedCreateTransferPage />
    </Suspense>
  );
}

async function AuthorizedCreateTransferPage() {
  await connection();
  const access = await getTransferAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const warehouses: TransferWarehouseOption[] = await db.warehouse.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Transfers">
      <TransferForm warehouses={warehouses} />
    </DashboardLayout>
  );
}
