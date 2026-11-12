import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, DollarSign, Download } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { calculatePurchaseTotals } from "@/lib/purchase-pricing";
import { db } from "@/lib/db";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { getSaleViewAccess } from "../authorization";
import { saleIdSchema } from "./payments/payment-schema";

export const metadata: Metadata = {
  title: "Sale Details",
  description: "View sale items, totals, and payment summary",
};

type SaleDetailsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SaleDetailsPage(props: SaleDetailsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale details...</p>
        </main>
      }
    >
      <AuthorizedSaleDetails {...props} />
    </Suspense>
  );
}

async function AuthorizedSaleDetails({ params, searchParams }: SaleDetailsPageProps) {
  await connection();
  const access = await getSaleViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedId = saleIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const sale = await db.sale.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      reference: true,
      date: true,
      status: true,
      orderTax: true,
      discount: true,
      shipping: true,
      grandTotal: true,
      paid: true,
      due: true,
      paymentStatus: true,
      paymentType: true,
      notes: true,
      createdAt: true,
      customer: {
        select: { name: true, email: true, phoneNumber: true, address: true, city: true, country: true },
      },
      warehouse: {
        select: { name: true, phoneNumber: true, city: true, country: true },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          netUnitPrice: true,
          quantity: true,
          unit: true,
          discountType: true,
          discount: true,
          taxType: true,
          orderTax: true,
          subtotal: true,
          product: { select: { name: true, code: true } },
        },
      },
      payments: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          amount: true,
          paymentType: true,
          date: true,
          notes: true,
        },
      },
    },
  });
  if (!sale) notFound();

  const totals = calculatePurchaseTotals({
    lineSubtotals: sale.items.map((item) => item.subtotal),
    orderTaxRate: sale.orderTax,
    discount: sale.discount,
    shipping: sale.shipping,
  });
  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const basePath = `/sales/${encodeURIComponent(sale.id)}`;

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales">
      <main className="gg-content">
        {query.updated === "1" && <WarehouseToast message="Sale updated successfully." />}
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Sale Details</h1>
            <p className="gg-muted">{sale.reference}</p>
          </div>
          <div className="purchase-detail-actions">
            <Link className="gg-btn gg-btn--secondary" href="/sales">
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
            <Link className="gg-btn gg-btn--secondary" href={`${basePath}/payments`}>
              <DollarSign aria-hidden="true" />
              Show Payments
            </Link>
            <a className="gg-btn gg-btn--primary" href={`${basePath}/pdf`}>
              <Download aria-hidden="true" />
              Download PDF
            </a>
          </div>
        </div>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-info-title">
          <h2 className="gg-card-title" id="sale-info-title">Sale Information</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Reference" value={sale.reference} />
            <Detail label="Date" value={formatDate(sale.date)} />
            <Detail label="Status" value={sale.status} />
            <Detail label="Created On" value={sale.createdAt.toLocaleString()} />
            <Detail label="Customer" value={sale.customer.name} />
            <Detail label="Customer Email" value={sale.customer.email} />
            <Detail label="Customer Phone" value={sale.customer.phoneNumber} />
            <Detail label="Customer Address" value={[
              sale.customer.address,
              sale.customer.city,
              sale.customer.country,
            ].filter(Boolean).join(", ")} />
            <Detail label="Warehouse" value={sale.warehouse?.name ?? "Warehouse unavailable"} />
            <Detail label="Warehouse Location" value={sale.warehouse
              ? [sale.warehouse.city, sale.warehouse.country].filter(Boolean).join(", ")
              : "Warehouse unavailable"} />
            <Detail label="Warehouse Phone" value={sale.warehouse?.phoneNumber ?? "Warehouse unavailable"} />
            <Detail label="Payment Type" value={sale.paymentType} />
            <Detail label="Notes" value={sale.notes || "—"} full />
          </dl>
        </section>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-items-title">
          <h2 className="gg-card-title" id="sale-items-title">Order Items</h2>
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
                {sale.items.map((item) => (
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
            <Detail label={`Order Tax (${sale.orderTax.toFixed(2)}%)`} value={`$ ${totals.orderTax.toFixed(2)}`} />
            <Detail label="Discount" value={`$ ${sale.discount.toFixed(2)}`} />
            <Detail label="Shipping" value={`$ ${sale.shipping.toFixed(2)}`} />
            <Detail label="Grand Total" value={`$ ${sale.grandTotal.toFixed(2)}`} strong />
          </dl>
        </section>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-payment-summary-title">
          <h2 className="gg-card-title" id="sale-payment-summary-title">Payment Summary</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Payment Status" value={sale.paymentStatus} />
            <Detail label="Paid" value={`$ ${sale.paid.toFixed(2)}`} />
            <Detail label="Due" value={`$ ${sale.due.toFixed(2)}`} />
          </dl>
          <div className="gg-table-wrap" style={{ marginTop: "var(--sp-5)" }}>
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="gg-num">Amount</th>
                  <th scope="col">Payment Type</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {sale.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.date)}</td>
                    <td className="gg-num">$ {payment.amount.toFixed(2)}</td>
                    <td>{payment.paymentType}</td>
                    <td className="gg-muted">{payment.notes || "—"}</td>
                  </tr>
                ))}
                {sale.payments.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={4}>No payments recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
