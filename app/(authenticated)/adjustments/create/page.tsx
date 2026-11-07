import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getAdjustmentAccess } from "../authorization";
import AdjustmentForm from "./AdjustmentForm";

export const metadata: Metadata = {
  title: "Create Adjustment",
  description: "Adjust warehouse product stock",
};

export default function CreateAdjustmentPage() {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading adjustment form...</p>
        </main>
      }
    >
      <AuthorizedCreateAdjustmentPage />
    </Suspense>
  );
}

async function AuthorizedCreateAdjustmentPage() {
  await connection();
  const access = await getAdjustmentAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const warehouses = await db.warehouse.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <DashboardLayout
      user={{ name: `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email, image: access.user.image }}
      pageTitle="Adjustments"
    >
      <main className="gg-content">
        <div className="page-head">
          <h1 className="gg-page-title">Create Adjustment</h1>
          <Link className="gg-btn gg-btn--secondary" href="/adjustments">
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </div>
        <AdjustmentForm warehouses={warehouses} />
      </main>
    </DashboardLayout>
  );
}
