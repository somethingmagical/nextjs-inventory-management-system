import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SalePaymentForm from "@/components/sales/SalePaymentForm";
import WarehouseToast from "@/components/shared/WarehouseToast";
import AutoSearchForm from "@/components/shared/AutoSearchForm";
import DynamicPageSizeSelect from "@/components/shared/DynamicPageSizeSelect";
import SortableTableHeader from "@/components/shared/SortableTableHeader";
import TableSortFilter from "@/components/shared/TableSortFilter";
import { db } from "@/lib/db";
import { getSaleViewAccess } from "../../authorization";
import { PERMISSION } from "@/lib/permissions";
import { saleIdSchema } from "./payment-schema";
import { parseSortBy, parseSortOrder } from "@/lib/table-sorting";

const querySchema = z.string().trim().max(120);
const pageSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());
const pageSizeSchema = z.enum(["10", "25", "50"]).transform(Number);
const sortFields = ["date", "amount", "paymentType", "createdAt"] as const;
const sortOptions = [
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "paymentType", label: "Payment Type" },
  { value: "createdAt", label: "Recorded On" },
] as const;

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

async function AuthorizedSalePayments({
  params,
  searchParams,
}: SalePaymentsPageProps) {
  await connection();
  const access = await getSaleViewAccess();
  if (access.status === "unauthenticated") redirect("/");
  if (access.status === "forbidden") redirect("/dashboard");
  const canManageSales = access.user.permissions.includes(
    PERMISSION.manageSale,
  );

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedId = saleIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const parsedQuery = querySchema.safeParse(query.q);
  const parsedPage = pageSchema.safeParse(query.page);
  const parsedPageSize = pageSizeSchema.safeParse(query.pageSize);
  const search = parsedQuery.success ? parsedQuery.data : "";
  const requestedPage = parsedPage.success ? parsedPage.data : 1;
  const pageSize = parsedPageSize.success ? parsedPageSize.data : 10;
  const sortBy = parseSortBy(query.sortBy, sortFields, "date");
  const sortOrder = parseSortOrder(query.sortOrder);

  const sale = await db.sale.findFirst({
    where: { id: parsedId.data, deletedAt: null },
    select: {
      id: true,
      reference: true,
      grandTotal: true,
      paid: true,
      due: true,
      paymentStatus: true,
    },
  });
  if (!sale) notFound();

  const where: Prisma.SalePaymentWhereInput = {
    saleId: sale.id,
    ...(search
      ? {
          OR: [
            { paymentType: { contains: search } },
            { notes: { contains: search } },
          ],
        }
      : {}),
  };
  const totalCount = await db.salePayment.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const orderBy: Prisma.SalePaymentOrderByWithRelationInput[] = [
    { [sortBy]: sortOrder },
    { id: sortOrder },
  ];
  const payments = await db.salePayment.findMany({
    where,
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      amount: true,
      paymentType: true,
      date: true,
      notes: true,
      createdAt: true,
    },
  });

  const displayName =
    `${access.user.firstName} ${access.user.lastName}`.trim() ||
    access.user.email;
  const paymentAdded = query.added === "1";
  const firstRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRecord = Math.min(currentPage * pageSize, totalCount);
  const paginationParams = {
    q: search,
    pageSize,
    sortBy,
    sortOrder,
    ...(paymentAdded ? { added: "1" } : {}),
  };
  const basePath = `/sales/${encodeURIComponent(sale.id)}/payments`;

  return (
    <DashboardLayout
      user={{ name: displayName, image: access.user.image }}
      pageTitle="Sales"
    >
      <main className="gg-content">
        {paymentAdded && (
          <WarehouseToast message="Payment added successfully." />
        )}
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

        <section
          className="gg-card gg-card-pad purchase-detail-card"
          aria-labelledby="sale-payment-summary-title"
        >
          <h2 className="gg-card-title" id="sale-payment-summary-title">
            Payment Summary
          </h2>
          <dl className="purchase-detail-grid">
            <Detail
              label="Grand Total"
              value={`$ ${sale.grandTotal.toFixed(2)}`}
            />
            <Detail label="Paid" value={`$ ${sale.paid.toFixed(2)}`} />
            <Detail label="Due" value={`$ ${sale.due.toFixed(2)}`} />
            <Detail label="Payment Status" value={sale.paymentStatus} />
          </dl>
        </section>

        {canManageSales ? (
          <SalePaymentForm saleId={sale.id} />
        ) : (
          <p className="gg-muted">
            You have view-only access to sale payments.
          </p>
        )}

        <section
          className="gg-card gg-card-pad purchase-detail-card"
          aria-labelledby="sale-payment-history-title"
        >
          <h2 className="gg-card-title" id="sale-payment-history-title">
            Payment History
          </h2>
          <div className="gg-table-toolbar">
            <div
              className="table-search-filter-group"
              role="group"
              aria-label="Search and filters"
            >
              <AutoSearchForm
                action={basePath}
                className="warehouse-search-form"
                iconClassName="gg-input-icon warehouse-search-control"
                id="sale-payment-search"
                label="Search payments"
                placeholder="Search payment type or notes"
                value={search}
              />
              <TableSortFilter
                sortBy={sortBy}
                sortOrder={sortOrder}
                options={sortOptions}
              />
            </div>
          </div>
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <SortableTableHeader
                    label="Date"
                    sortKey="date"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname={basePath}
                    searchParams={query}
                  />
                  <SortableTableHeader
                    label="Amount"
                    sortKey="amount"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname={basePath}
                    searchParams={query}
                    className="gg-num"
                  />
                  <SortableTableHeader
                    label="Payment Type"
                    sortKey="paymentType"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname={basePath}
                    searchParams={query}
                  />
                  <th scope="col">Notes</th>
                  <SortableTableHeader
                    label="Recorded On"
                    sortKey="createdAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    pathname={basePath}
                    searchParams={query}
                  />
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.date)}</td>
                    <td className="gg-num gg-td-strong">
                      $ {payment.amount.toFixed(2)}
                    </td>
                    <td>
                      <span className="gg-chip-unit">
                        {payment.paymentType}
                      </span>
                    </td>
                    <td className="gg-muted">{payment.notes || "—"}</td>
                    <td>{payment.createdAt.toLocaleString()}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td className="product-empty-cell" colSpan={5}>
                      <p className="warehouse-empty-title">
                        {search
                          ? "No payments match your search"
                          : "No payments recorded"}
                      </p>
                      <p className="gg-muted">
                        {search
                          ? "Try another payment type or note."
                          : "Add a payment to see it in this history."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="gg-pagination">
            <DynamicPageSizeSelect
              id="sale-payment-page-size"
              pageSize={pageSize}
            />
            <span className="gg-muted gg-num" aria-live="polite">
              {firstRecord}–{lastRecord} of {totalCount}
            </span>
            <div className="gg-spacer" />
            <PageLink
              page={1}
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={basePath}
              params={paginationParams}
              label="First page"
            >
              <ChevronFirst aria-hidden="true" />
            </PageLink>
            <PageLink
              page={Math.max(1, currentPage - 1)}
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={basePath}
              params={paginationParams}
              label="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
            </PageLink>
            <PageLink
              page={Math.min(totalPages, currentPage + 1)}
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={basePath}
              params={paginationParams}
              label="Next page"
            >
              <ChevronRight aria-hidden="true" />
            </PageLink>
            <PageLink
              page={totalPages}
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={basePath}
              params={paginationParams}
              label="Last page"
            >
              <ChevronLast aria-hidden="true" />
            </PageLink>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}

function PageLink({
  page,
  currentPage,
  totalPages,
  basePath,
  params,
  label,
  children,
}: {
  page: number;
  currentPage: number;
  totalPages: number;
  basePath: string;
  params: Record<string, string | number>;
  label: string;
  children: React.ReactNode;
}) {
  const disabled = totalPages === 0 || page === currentPage;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "") searchParams.set(key, String(value));
  }
  searchParams.set("page", String(page));

  if (disabled) {
    return (
      <span
        aria-label={label}
        aria-disabled="true"
        className="gg-page-btn is-disabled"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      aria-label={label}
      className="gg-page-btn"
      href={`${basePath}?${searchParams.toString()}`}
    >
      {children}
    </Link>
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
