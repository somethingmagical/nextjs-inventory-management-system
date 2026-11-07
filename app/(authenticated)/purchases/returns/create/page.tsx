import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PurchaseReturnForm from "@/components/purchases/PurchaseReturnForm";
import { db } from "@/lib/db";
import { getPurchaseReturnAccess } from "../authorization";

export const metadata: Metadata = {
  title: "Create Purchase Return",
  description: "Create a supplier purchase return",
};

export default function CreatePurchaseReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading purchase return form...</p>
        </main>
      }
    >
      <AuthorizedCreatePurchaseReturnPage />
    </Suspense>
  );
}

async function AuthorizedCreatePurchaseReturnPage() {
  await connection();
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [warehouses, suppliers] = await Promise.all([
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

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Purchases Returns">
      <main className="gg-content">
        <div className="page-head">
          <h1 className="gg-page-title">Create Purchase Return</h1>
          <Link className="gg-btn gg-btn--secondary" href="/purchases/returns">
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </div>
        <PurchaseReturnForm warehouses={warehouses} suppliers={suppliers} />
      </main>
    </DashboardLayout>
  );
}
