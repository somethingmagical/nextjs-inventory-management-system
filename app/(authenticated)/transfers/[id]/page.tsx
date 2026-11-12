import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getTransferViewAccess } from "../authorization";
import { getTransferDetails } from "../transfer-details";

export const metadata: Metadata = {
  title: "Transfer Details",
  description: "View transfer warehouses, items, and totals",
};

const transferIdSchema = z.string().trim().min(1).max(191);

type TransferDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default function TransferDetailsPage({ params }: TransferDetailsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading transfer details...</p>
        </main>
      }
    >
      <AuthorizedTransferDetails params={params} />
    </Suspense>
  );
}

async function AuthorizedTransferDetails({ params }: TransferDetailsPageProps) {
  await connection();
  const access = await getTransferViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = transferIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const transfer = await getTransferDetails(parsedId.data);
  if (!transfer) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: transfer.items.map((item) => item.subtotal),
    orderTaxRate: transfer.orderTax,
    discount: transfer.discount,
    shipping: transfer.shipping,
  });
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Transfers">
      <main className="gg-content">
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Transfer Details</h1>
            <p className="gg-muted">{transfer.reference}</p>
          </div>
          <div className="purchase-detail-actions">
            <Link className="gg-btn gg-btn--secondary" href="/transfers">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
          </div>
        </div>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="transfer-info-title">
          <h2 className="gg-card-title" id="transfer-info-title">Transfer Information</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Reference" value={transfer.reference} />
            <Detail label="Date" value={formatDate(transfer.date)} />
            <Detail label="Status" value={transfer.status} />
            <Detail label="Created On" value={transfer.createdAt.toLocaleString()} />
            <Detail label="From Warehouse" value={transfer.fromWarehouse.name} />
            <Detail label="From Warehouse Location" value={[
              transfer.fromWarehouse.city,
              transfer.fromWarehouse.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="From Warehouse Phone" value={transfer.fromWarehouse.phoneNumber} />
            <Detail label="To Warehouse" value={transfer.toWarehouse.name} />
            <Detail label="To Warehouse Location" value={[
              transfer.toWarehouse.city,
              transfer.toWarehouse.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="To Warehouse Phone" value={transfer.toWarehouse.phoneNumber} />
            <Detail label="Notes" value={transfer.notes || "—"} full />
          </dl>
        </section>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="transfer-items-title">
          <h2 className="gg-card-title" id="transfer-items-title">Order Items</h2>
          <div className="gg-table-wrap">
            <table className="gg-table purchase-detail-items-table transfer-detail-items-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Code</th>
                  <th scope="col" className="gg-num">Net Unit Cost</th>
                  <th scope="col" className="gg-num">Quantity</th>
                  <th scope="col">Discount</th>
                  <th scope="col">Tax</th>
                  <th scope="col" className="gg-num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((item) => (
                  <tr key={item.id}>
                    <td className="gg-td-strong">{item.product.name}</td>
                    <td><span className="gg-chip-code">{item.product.code}</span></td>
                    <td className="gg-num">$ {item.netUnitCost.toFixed(2)}</td>
                    <td className="gg-num">{item.quantity.toString()} {item.product.productUnit}</td>
                    <td className="gg-num">
                      {item.discountType === "Percentage"
                        ? `${item.discount.toFixed(2)}%`
                        : `$ ${item.discount.toFixed(2)}`}
                    </td>
                    <td>{item.taxType} · {item.orderTax.toFixed(2)}%</td>
                    <td className="gg-num gg-td-strong">$ {item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="purchase-detail-totals">
            <Detail label={`Order Tax (${transfer.orderTax.toFixed(2)}%)`} value={`$ ${totals.orderTax.toFixed(2)}`} />
            <Detail label="Discount" value={`$ ${transfer.discount.toFixed(2)}`} />
            <Detail label="Shipping" value={`$ ${transfer.shipping.toFixed(2)}`} />
            <Detail label="Grand Total" value={`$ ${transfer.grandTotal.toFixed(2)}`} strong />
          </dl>
        </section>
      </main>
    </DashboardLayout>
  );
}

function Detail({
  label,
  value,
  full = false,
  strong = false,
}: {
  label: string;
  value: string;
  full?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={full ? "purchase-detail-item purchase-detail-item--full" : "purchase-detail-item"}>
      <dt>{label}</dt>
      <dd className={strong ? "purchase-detail-value-strong" : undefined}>{value || "—"}</dd>
    </div>
  );
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
