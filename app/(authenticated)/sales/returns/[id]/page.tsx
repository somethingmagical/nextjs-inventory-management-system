import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { getSaleReturnAccess } from "../../authorization";
import { getSaleReturnDetails } from "../sale-return-details";
import { saleReturnIdSchema } from "../sale-return-schema";

export const metadata: Metadata = {
  title: "Sale Return Details",
  description: "View returned sale items, totals, and refund summary",
};

type SaleReturnDetailsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SaleReturnDetailsPage(props: SaleReturnDetailsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale return details...</p>
        </main>
      }
    >
      <AuthorizedSaleReturnDetails {...props} />
    </Suspense>
  );
}

async function AuthorizedSaleReturnDetails({ params, searchParams }: SaleReturnDetailsPageProps) {
  await connection();
  const access = await getSaleReturnAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedId = saleReturnIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const saleReturn = await getSaleReturnDetails(parsedId.data);
  if (!saleReturn) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: saleReturn.items.map((item) => item.subtotal),
    orderTaxRate: saleReturn.orderTax,
    discount: saleReturn.discount,
    shipping: saleReturn.shipping,
  });
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales Returns">
      <main className="gg-content">
        {query.updated === "1" && <WarehouseToast message="Sale return updated successfully." />}
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Sale Return Details</h1>
            <p className="gg-muted">{saleReturn.reference}</p>
          </div>
          <div className="purchase-detail-actions">
            <Link className="gg-btn gg-btn--secondary" href="/sales/returns">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
            <a
              className="gg-btn gg-btn--primary"
              href={`/sales/returns/${encodeURIComponent(saleReturn.id)}/pdf`}
            >
              <Download aria-hidden="true" />
              Download PDF
            </a>
          </div>
        </div>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-return-info-title">
          <h2 className="gg-card-title" id="sale-return-info-title">Sale Return Information</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Reference" value={saleReturn.reference} />
            <Detail label="Date" value={formatDate(saleReturn.date)} />
            <Detail label="Status" value={saleReturn.status} />
            <Detail label="Created On" value={saleReturn.createdAt.toLocaleString()} />
            <Detail label="Customer" value={saleReturn.customer.name} />
            <Detail label="Customer Email" value={saleReturn.customer.email} />
            <Detail label="Customer Phone" value={saleReturn.customer.phoneNumber} />
            <Detail label="Customer Address" value={[
              saleReturn.customer.address,
              saleReturn.customer.city,
              saleReturn.customer.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="Warehouse" value={saleReturn.warehouse?.name ?? "Warehouse unavailable"} />
            <Detail label="Warehouse Location" value={saleReturn.warehouse
              ? [saleReturn.warehouse.city, saleReturn.warehouse.country].filter(Boolean).join(", ")
              : "Warehouse unavailable"} />
            <Detail label="Warehouse Phone" value={saleReturn.warehouse?.phoneNumber ?? "Warehouse unavailable"} />
            <div className="purchase-detail-item">
              <dt>Original Sale</dt>
              <dd>
                {saleReturn.sale && !saleReturn.sale.deletedAt
                  ? <Link href={`/sales/${encodeURIComponent(saleReturn.sale.id)}`}>{saleReturn.sale.reference}</Link>
                  : saleReturn.sale?.reference ?? "—"}
              </dd>
            </div>
            <Detail label="Notes" value={saleReturn.notes || "—"} full />
          </dl>
        </section>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-return-items-title">
          <h2 className="gg-card-title" id="sale-return-items-title">Returned Items</h2>
          <div className="gg-table-wrap">
            <table className="gg-table purchase-detail-items-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Code</th>
                  <th scope="col" className="gg-num">Net Unit Price</th>
                  <th scope="col" className="gg-num">Quantity</th>
                  <th scope="col">Discount</th>
                  <th scope="col">Tax</th>
                  <th scope="col" className="gg-num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {saleReturn.items.map((item) => (
                  <tr key={item.id}>
                    <td className="gg-td-strong">{item.product.name}</td>
                    <td><span className="gg-chip-code">{item.product.code}</span></td>
                    <td className="gg-num">$ {item.netUnitPrice.toFixed(2)}</td>
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
            <Detail label={`Order Tax (${saleReturn.orderTax.toFixed(2)}%)`} value={`$ ${totals.orderTax.toFixed(2)}`} />
            <Detail label="Discount" value={`$ ${saleReturn.discount.toFixed(2)}`} />
            <Detail label="Shipping" value={`$ ${saleReturn.shipping.toFixed(2)}`} />
            <Detail label="Grand Total" value={`$ ${saleReturn.grandTotal.toFixed(2)}`} strong />
          </dl>
        </section>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-return-refund-title">
          <h2 className="gg-card-title" id="sale-return-refund-title">Refund Summary</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Refund Status" value={saleReturn.paymentStatus} />
            <Detail label="Refunded" value={`$ ${saleReturn.paid.toFixed(2)}`} />
            <Detail label="Refund Due" value={`$ ${saleReturn.due.toFixed(2)}`} />
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
