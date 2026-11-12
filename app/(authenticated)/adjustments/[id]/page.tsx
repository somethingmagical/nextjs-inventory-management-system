import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { db } from "@/lib/db";
import { getAdjustmentViewAccess } from "../authorization";
import { adjustmentIdSchema } from "../adjustment-schema";

export const metadata: Metadata = {
  title: "Adjustment Details",
  description: "View warehouse stock adjustment details",
};

type AdjustmentDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdjustmentDetailsPage({
  params,
}: AdjustmentDetailsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading adjustment details...</p>
        </main>
      }
    >
      <AuthorizedAdjustmentDetails params={params} />
    </Suspense>
  );
}

async function AuthorizedAdjustmentDetails({ params }: AdjustmentDetailsPageProps) {
  await connection();
  const access = await getAdjustmentViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = adjustmentIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const adjustment = await db.adjustment.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      reference: true,
      date: true,
      createdAt: true,
      warehouse: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          type: true,
          product: { select: { name: true, code: true, productUnit: true } },
        },
      },
    },
  });
  if (!adjustment) notFound();

  return (
    <DashboardLayout
      user={{ name: `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email, image: access.user.image }}
      pageTitle="Adjustments"
    >
      <main className="gg-content">
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Adjustment Details</h1>
            <p className="gg-muted">{adjustment.reference}</p>
          </div>
          <Link className="gg-btn gg-btn--secondary" href="/adjustments">
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        </div>

        <section className="gg-card gg-card-pad adjustment-details-card" aria-label="Adjustment information">
          <dl className="adjustment-details-grid">
            <div>
              <dt>Reference</dt>
              <dd><span className="gg-chip-code">{adjustment.reference}</span></dd>
            </div>
            <div>
              <dt>Warehouse</dt>
              <dd>{adjustment.warehouse?.name ?? "Warehouse unavailable"}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>
                <time dateTime={adjustment.date.toISOString()}>
                  {adjustment.date.toLocaleDateString("en", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </time>
              </dd>
            </div>
            <div>
              <dt>Created On</dt>
              <dd><time dateTime={adjustment.createdAt.toISOString()}>{adjustment.createdAt.toLocaleString()}</time></dd>
            </div>
          </dl>

          <h2 className="gg-card-title adjustment-details-heading">Order items</h2>
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Code</th>
                  <th scope="col" className="gg-num">Quantity</th>
                  <th scope="col">Type</th>
                </tr>
              </thead>
              <tbody>
                {adjustment.items.map((item) => (
                  <tr key={item.id}>
                    <td className="gg-td-strong">{item.product.name}</td>
                    <td><span className="gg-chip-code">{item.product.code}</span></td>
                    <td className="gg-num">{item.quantity.toString()} {item.product.productUnit}</td>
                    <td>
                      <span className={`gg-badge ${item.type === "Addition" ? "gg-badge--success" : "gg-badge--warning"}`}>
                        {item.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
