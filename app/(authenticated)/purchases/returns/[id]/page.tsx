import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getPurchaseReturnAccess } from "../authorization";
import { purchaseReturnIdSchema } from "../purchase-return-create-schema";
import { getPurchaseReturnDetails } from "../purchase-return-details";

export const metadata: Metadata = {
  title: "Purchase Return Details",
  description: "View supplier purchase return details",
};

type PurchaseReturnDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default function PurchaseReturnDetailsPage({ params }: PurchaseReturnDetailsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading purchase return details...</p>
        </main>
      }
    >
      <AuthorizedPurchaseReturnDetails params={params} />
    </Suspense>
  );
}

async function AuthorizedPurchaseReturnDetails({ params }: PurchaseReturnDetailsPageProps) {
  await connection();
  const access = await getPurchaseReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const { id } = await params;
  const parsedId = purchaseReturnIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const purchaseReturn = await getPurchaseReturnDetails(parsedId.data);
  if (!purchaseReturn) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: purchaseReturn.items.map((item) => item.subtotal),
    orderTaxRate: purchaseReturn.orderTax,
    discount: purchaseReturn.discount,
    shipping: purchaseReturn.shipping,
  });
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Purchases Returns">
      <main className="gg-content">
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Purchase Return Details</h1>
            <p className="gg-muted">{purchaseReturn.reference}</p>
          </div>
          <div className="purchase-detail-actions">
            <Link className="gg-btn gg-btn--secondary" href="/purchases/returns">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
            <a
              className="gg-btn gg-btn--primary"
              href={`/purchases/returns/${encodeURIComponent(purchaseReturn.id)}/pdf`}
            >
              <Download aria-hidden="true" />
              Download PDF
            </a>
          </div>
        </div>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="purchase-return-info-title">
          <h2 className="gg-card-title" id="purchase-return-info-title">Purchase Return Information</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Reference" value={purchaseReturn.reference} />
            <Detail label="Date" value={formatDate(purchaseReturn.date)} />
            <Detail label="Status" value={purchaseReturn.status} />
            <Detail label="Created On" value={purchaseReturn.createdAt.toLocaleString()} />
            <Detail label="Supplier" value={purchaseReturn.supplier.name} />
            <Detail label="Supplier Email" value={purchaseReturn.supplier.email} />
            <Detail label="Supplier Phone" value={purchaseReturn.supplier.phoneNumber} />
            <Detail label="Supplier Address" value={[
              purchaseReturn.supplier.address,
              purchaseReturn.supplier.city,
              purchaseReturn.supplier.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="Warehouse" value={purchaseReturn.warehouse.name} />
            <Detail label="Warehouse Location" value={[
              purchaseReturn.warehouse.city,
              purchaseReturn.warehouse.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="Warehouse Phone" value={purchaseReturn.warehouse.phoneNumber} />
            <Detail label="Payment Type" value={purchaseReturn.paymentType} />
            <Detail label="Paid" value={`$ ${purchaseReturn.paid.toFixed(2)}`} />
            <Detail label="Due" value={`$ ${purchaseReturn.due.toFixed(2)}`} />
            <Detail label="Notes" value={purchaseReturn.notes || "—"} full />
          </dl>
        </section>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="purchase-return-items-title">
          <h2 className="gg-card-title" id="purchase-return-items-title">Return Items</h2>
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
                {purchaseReturn.items.map((item) => (
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
                    <td>{item.taxType} · {item.orderTax.toFixed(2)}%</td>
                    <td className="gg-num gg-td-strong">$ {item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="purchase-detail-totals">
            <Detail label={`Order Tax (${purchaseReturn.orderTax.toFixed(2)}%)`} value={`$ ${totals.orderTax.toFixed(2)}`} />
            <Detail label="Discount" value={`$ ${purchaseReturn.discount.toFixed(2)}`} />
            <Detail label="Shipping" value={`$ ${purchaseReturn.shipping.toFixed(2)}`} />
            <Detail label="Grand Total" value={`$ ${purchaseReturn.grandTotal.toFixed(2)}`} strong />
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
