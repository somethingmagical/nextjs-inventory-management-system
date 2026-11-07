import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getPurchaseAccess } from "../authorization";
import { purchaseIdSchema } from "../purchase-create-schema";
import { getPurchaseDetails } from "../purchase-details";

export const metadata: Metadata = {
  title: "Purchase Details",
  description: "View supplier purchase details",
};

type PurchaseDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default function PurchaseDetailsPage({ params }: PurchaseDetailsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading purchase details...</p>
        </main>
      }
    >
      <AuthorizedPurchaseDetails params={params} />
    </Suspense>
  );
}

async function AuthorizedPurchaseDetails({ params }: PurchaseDetailsPageProps) {
  await connection();
  const access = await getPurchaseAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = purchaseIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const purchase = await getPurchaseDetails(parsedId.data);
  if (!purchase) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: purchase.items.map((item) => item.subtotal),
    orderTaxRate: purchase.orderTax,
    discount: purchase.discount,
    shipping: purchase.shipping,
  });
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Purchases">
      <main className="gg-content">
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Purchase Details</h1>
            <p className="gg-muted">{purchase.reference}</p>
          </div>
          <div className="purchase-detail-actions">
            <Link className="gg-btn gg-btn--secondary" href="/purchases">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
            <a
              className="gg-btn gg-btn--primary"
              href={`/purchases/${encodeURIComponent(purchase.id)}/pdf`}
            >
              <Download aria-hidden="true" />
              Download PDF
            </a>
          </div>
        </div>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="purchase-info-title">
          <h2 className="gg-card-title" id="purchase-info-title">Purchase Information</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Reference" value={purchase.reference} />
            <Detail label="Date" value={formatDate(purchase.date)} />
            <Detail label="Status" value={purchase.status} />
            <Detail label="Created On" value={purchase.createdAt.toLocaleString()} />
            <Detail label="Supplier" value={purchase.supplier.name} />
            <Detail label="Supplier Email" value={purchase.supplier.email} />
            <Detail label="Supplier Phone" value={purchase.supplier.phoneNumber} />
            <Detail label="Supplier Address" value={[
              purchase.supplier.address,
              purchase.supplier.city,
              purchase.supplier.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="Warehouse" value={purchase.warehouse.name} />
            <Detail label="Warehouse Location" value={[
              purchase.warehouse.city,
              purchase.warehouse.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="Warehouse Phone" value={purchase.warehouse.phoneNumber} />
            <Detail label="Payment Type" value={purchase.paymentType} />
            <Detail label="Payment Status" value={purchase.paymentStatus} />
            <Detail label="Notes" value={purchase.notes || "—"} full />
          </dl>
        </section>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="purchase-items-title">
          <h2 className="gg-card-title" id="purchase-items-title">Order Items</h2>
          <div className="gg-table-wrap">
            <table className="gg-table purchase-detail-items-table">
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
                {purchase.items.map((item) => (
                  <tr key={item.id}>
                    <td className="gg-td-strong">{item.product.name}</td>
                    <td><span className="gg-chip-code">{item.product.code}</span></td>
                    <td className="gg-num">$ {item.netUnitCost.toFixed(2)}</td>
                    <td className="gg-num">{item.quantity.toString()} {item.unit}</td>
                    <td className="gg-num">
                      {item.discountType === "Percentage"
                        ? `${item.discount.toFixed(2)}%`
                        : `$ ${item.discount.toFixed(2)}`}
                    </td>
                    <td>
                      {item.taxType} · {item.orderTax.toFixed(2)}%
                    </td>
                    <td className="gg-num gg-td-strong">$ {item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="purchase-detail-totals">
            <Detail label={`Order Tax (${purchase.orderTax.toFixed(2)}%)`} value={`$ ${totals.orderTax.toFixed(2)}`} />
            <Detail label="Discount" value={`$ ${purchase.discount.toFixed(2)}`} />
            <Detail label="Shipping" value={`$ ${purchase.shipping.toFixed(2)}`} />
            <Detail label="Grand Total" value={`$ ${purchase.grandTotal.toFixed(2)}`} strong />
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
