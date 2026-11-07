import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SalePaymentForm from "@/components/sales/SalePaymentForm";
import WarehouseToast from "@/components/shared/WarehouseToast";
import { db } from "@/lib/db";
import { getSaleAccess } from "../../authorization";
import { saleIdSchema } from "./payment-schema";

export const metadata: Metadata = {
  title: "Sale Payments",
  description: "View and record payments for a sale",
};

type SalePaymentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function SalePaymentsPage(props: SalePaymentsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="gg-content" aria-busy="true">
          <p className="gg-muted">Loading sale payments...</p>
        </main>
      }
    >
      <AuthorizedSalePayments {...props} />
    </Suspense>
  );
}

async function AuthorizedSalePayments({ params, searchParams }: SalePaymentsPageProps) {
  await connection();
  const access = await getSaleAccess();
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
      grandTotal: true,
      paid: true,
      due: true,
      paymentStatus: true,
      payments: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          amount: true,
          paymentType: true,
          date: true,
          notes: true,
          createdAt: true,
        },
      },
    },
  });
  if (!sale) notFound();

  const displayName = `${access.user.firstName} ${access.user.lastName}`.trim() || access.user.email;
  const paymentAdded = query.added === "1";

  return (
    <DashboardLayout user={{ name: displayName, image: access.user.image }} pageTitle="Sales">
      <main className="gg-content">
        {paymentAdded && <WarehouseToast message="Payment added successfully." />}
        <div className="page-head">
          <div>
            <h1 className="gg-page-title">Sale Payments</h1>
            <p className="gg-muted">{sale.reference}</p>
          </div>
          <Link className="gg-btn gg-btn--secondary" href="/sales">
            <ArrowLeft aria-hidden="true" />
            Back to Sales
          </Link>
        </div>

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-payment-summary-title">
          <h2 className="gg-card-title" id="sale-payment-summary-title">Payment Summary</h2>
          <dl className="purchase-detail-grid">
            <Detail label="Grand Total" value={`$ ${sale.grandTotal.toFixed(2)}`} />
            <Detail label="Paid" value={`$ ${sale.paid.toFixed(2)}`} />
            <Detail label="Due" value={`$ ${sale.due.toFixed(2)}`} />
            <Detail label="Payment Status" value={sale.paymentStatus} />
          </dl>
        </section>

        <SalePaymentForm saleId={sale.id} />

        <section className="gg-card gg-card-pad purchase-detail-card" aria-labelledby="sale-payment-history-title">
          <h2 className="gg-card-title" id="sale-payment-history-title">Payment History</h2>
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="gg-num">Amount</th>
                  <th scope="col">Payment Type</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Recorded On</th>
                </tr>
              </thead>
              <tbody>
                {sale.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.date)}</td>
                    <td className="gg-num gg-td-strong">$ {payment.amount.toFixed(2)}</td>
                    <td><span className="gg-chip-unit">{payment.paymentType}</span></td>
                    <td className="gg-muted">{payment.notes || "—"}</td>
                    <td>{payment.createdAt.toLocaleString()}</td>
                  </tr>
                ))}
                {sale.payments.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={5}>
                      <p className="warehouse-empty-title">No payments recorded</p>
                      <p className="gg-muted">Add a payment to see it in this history.</p>
                    </td>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="purchase-detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
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
